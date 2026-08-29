import os 
import enum
import uuid

from datetime import datetime

from sqlalchemy import (
    create_engine,
    Column,
    String,
    JSON,
    DateTime,
    Text,
    Enum,
    ForeignKey,
)

from sqlalchemy.orm import sessionmaker, declarative_base, relationship


MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "Thando3376!")
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = os.getenv("MYSQL_PORT", "3306")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "medvision")


DATABASE_URL = (
    f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
    f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"
)


engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


class JobStatus(enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String(50), primary_key=True)

    external_patient_id = Column(
        String(100),
        unique=True,
        index=True,
        nullable=False,
    )

    name = Column(String(255), nullable=False)
    age = Column(String(20), nullable=True)
    gender = Column(String(50), nullable=True)
    scan_type = Column(String(100), nullable=True)
    scan_date = Column(String(50), nullable=True)

    image_url = Column(String(500), nullable=True)
    heatmap_url = Column(String(500), nullable=True)

    ai_findings = Column(JSON, nullable=True)

    clinical_symptoms = Column(Text, nullable=True)
    clinical_history = Column(Text, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id = Column(String(50), primary_key=True)

    idempotency_key = Column(
        String(100),
        unique=True,
        index=True,
    )

    patient_id = Column(
        String(50),
        nullable=True,
        index=True,
    )

    status = Column(
        Enum(JobStatus),
        default=JobStatus.PENDING,
    )

    findings = Column(JSON, nullable=True)

    error_message = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


def init_db():
    Base.metadata.create_all(bind=engine)
