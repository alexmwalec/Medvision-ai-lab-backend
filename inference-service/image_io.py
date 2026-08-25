from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any

import numpy as np
import pydicom
from PIL import Image, UnidentifiedImageError
from pydicom.dataset import Dataset
from pydicom.errors import InvalidDicomError
from pydicom.pixels import apply_modality_lut, apply_voi_lut


class ImageDecodeError(ValueError):
    """Raised when an uploaded study cannot safely be decoded for inference."""


@dataclass(frozen=True)
class DecodedImage:
    image: Image.Image
    source_format: str
    dicom_metadata: dict[str, Any] | None = None


def _first(value: Any) -> Any:
    """Return the first value in a DICOM multi-value field."""
    if isinstance(value, (list, tuple)):
        return value[0] if value else None
    return value


def _metadata(ds: Dataset) -> dict[str, Any]:
    # Only interoperability/provenance fields belong in the response.  Do not
    # return patient name, date of birth, or other unnecessary PHI.
    return {
        "study_instance_uid": str(ds.get("StudyInstanceUID", "")) or None,
        "series_instance_uid": str(ds.get("SeriesInstanceUID", "")) or None,
        "sop_instance_uid": str(ds.get("SOPInstanceUID", "")) or None,
        "sop_class_uid": str(ds.get("SOPClassUID", "")) or None,
        "modality": str(ds.get("Modality", "")) or None,
        "rows": int(ds.get("Rows", 0)) or None,
        "columns": int(ds.get("Columns", 0)) or None,
        "number_of_frames": int(ds.get("NumberOfFrames", 1)),
        "view_position": str(ds.get("ViewPosition", "")) or None,
    }


def _to_uint8(values: np.ndarray, invert: bool = False) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        raise ImageDecodeError("DICOM pixel data contains no finite values.")

    # If DICOM has no VOI/window, robust percentiles avoid a few outlier pixels
    # making the radiograph nearly black.  This is a display transform only;
    # original DICOM is retained by the caller.
    low, high = np.percentile(finite, (0.5, 99.5))
    if high <= low:
        high = low + 1.0
    scaled = np.clip((values - low) / (high - low), 0, 1)
    if invert:
        scaled = 1 - scaled
    return np.round(scaled * 255).astype(np.uint8)


def _select_frame(pixels: np.ndarray, number_of_frames: int) -> np.ndarray:
    if number_of_frames <= 1:
        return pixels
    # A CXR is normally single-frame.  For multi-frame DICOM use the middle
    # frame deterministically and expose the frame count in metadata.
    return pixels[number_of_frames // 2]


def decode_dicom(raw_bytes: bytes) -> DecodedImage:
    try:
        ds = pydicom.dcmread(io.BytesIO(raw_bytes), force=False)
    except InvalidDicomError as exc:
        raise ImageDecodeError("The upload is not a valid DICOM Part 10 file.") from exc

    if "PixelData" not in ds:
        raise ImageDecodeError("DICOM file does not contain Pixel Data.")

    try:
        pixels = ds.pixel_array
    except Exception as exc:  # Decoder errors differ by transfer syntax/plugin.
        transfer_syntax = getattr(ds.file_meta, "TransferSyntaxUID", "unknown")
        raise ImageDecodeError(
            "Unable to decode DICOM pixel data "
            f"(transfer syntax: {transfer_syntax}). Install an appropriate "
            "pydicom pixel-data decoder or provide an uncompressed DICOM file."
        ) from exc

    frame_count = int(ds.get("NumberOfFrames", 1))
    pixels = _select_frame(pixels, frame_count)
    photometric = str(ds.get("PhotometricInterpretation", "MONOCHROME2")).upper()

    if photometric.startswith("MONOCHROME"):
        try:
            pixels = apply_modality_lut(pixels, ds)
            if "WindowCenter" in ds or "VOILUTSequence" in ds:
                pixels = apply_voi_lut(pixels, ds)
        except Exception as exc:
            raise ImageDecodeError("Unable to apply DICOM rescale/window information.") from exc
        gray = _to_uint8(pixels, invert=photometric == "MONOCHROME1")
        image = Image.fromarray(gray, mode="L").convert("RGB")
    elif photometric in {"RGB", "YBR_FULL", "YBR_FULL_422"}:
        if pixels.ndim != 3 or pixels.shape[-1] != 3:
            raise ImageDecodeError("Unsupported DICOM colour pixel layout.")
        if pixels.dtype != np.uint8:
            channels = [_to_uint8(pixels[..., channel]) for channel in range(3)]
            pixels = np.stack(channels, axis=-1)
        image = Image.fromarray(pixels, mode="RGB")
    else:
        raise ImageDecodeError(
            f"Unsupported DICOM photometric interpretation: {photometric}."
        )

    return DecodedImage(image=image, source_format="dicom", dicom_metadata=_metadata(ds))


def decode_uploaded_image(raw_bytes: bytes) -> DecodedImage:
    """Decode a DICOM Part 10 object or a supported conventional image."""
    try:
        return decode_dicom(raw_bytes)
    except ImageDecodeError as dicom_error:
        looks_like_dicom = raw_bytes[128:132] == b"DICM"
        if looks_like_dicom:
            raise dicom_error

    try:
        image = Image.open(io.BytesIO(raw_bytes))
        image.load()  # force decoding while the bytes stream remains open
        if image.format not in {"JPEG", "PNG"}:
            raise ImageDecodeError("Unsupported raster image. Upload DICOM, JPEG, or PNG.")
        return DecodedImage(image=image.convert("RGB"), source_format=image.format.lower())
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageDecodeError("Unsupported or corrupt image. Upload DICOM, JPEG, or PNG.") from exc
