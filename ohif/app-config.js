window.config = {
  routerBasename: "/",

  showStudyList: true,

  extensions: [],

  modes: [],

  dataSources: [
    {
      namespace:
        "@ohif/extension-default.dataSourcesModule.dicomweb",

      sourceName: "orthanc",

      configuration: {
        friendlyName: "MedVision DICOM Archive",

        name: "Orthanc",

        wadoUriRoot:
          "http://localhost:3001/dicom-web",

        qidoRoot:
          "http://localhost:3001/dicom-web",

        wadoRoot:
          "http://localhost:3001/dicom-web",

        stowRoot:
          "http://localhost:3001/dicom-web",

        imageRendering: "wadors",

        thumbnailRendering: "wadors",

        qidoSupportsIncludeField: true,

        enableStudyLazyLoad: true,

        supportsFuzzyMatching: true,

        supportsWildcard: true,

        dicomUploadEnabled: true
      }
    }
  ],

  defaultDataSourceName: "orthanc"
};