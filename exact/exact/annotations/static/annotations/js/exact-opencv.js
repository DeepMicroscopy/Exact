// opencv.js is big (7.7 MB). It is only needed for a few features (CLAHE filter, registration, screening preview),
// so it is loaded the first time one of them is used instead of with every annotation page.
//
//   EXACTOpenCV.isReady()   -> true if cv can be used
//   EXACTOpenCV.load()      -> Promise that resolves as soon as cv can be used (loads opencv.js once)
//
// The location of opencv.js is set by the page: window.EXACT_OPENCV_URL
window.EXACTOpenCV = (function () {

    let loading = undefined;

    function isReady() {
        return typeof cv === "object" && cv !== null && typeof cv.Mat === "function";
    }

    function load() {
        if (isReady()) {
            return Promise.resolve();
        }

        if (loading === undefined) {
            loading = new Promise(function (resolve, reject) {
                const script = document.createElement("script");
                script.async = true;
                script.src = window.EXACT_OPENCV_URL;
                script.onerror = function () {
                    loading = undefined;   // allow another try
                    reject(new Error("opencv.js could not be loaded"));
                };
                document.head.appendChild(script);

                // the library is usable once its runtime is initialized
                const check = setInterval(function () {
                    if (isReady()) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            });
        }
        return loading;
    }

    return { isReady: isReady, load: load };
})();
