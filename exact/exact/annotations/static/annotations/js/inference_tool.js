

class InferenceTool {

    constructor (imageInformation, user_id, gHeaders, viewer) {

        this.imageInformation = imageInformation;
        this.imageid = imageInformation['id'];
        this.gHeaders = gHeaders;
        this.viewer = viewer;
        this.user_id = user_id;

        this.initUiEvents(this);
    }

    initUiEvents(context) {

        $("#inference_update_btn").click(this.performeInference.bind(this));

    }

    performeInference(event) {

        const img = this.viewer.canvas.children[0];

        // Load the model.
        mobilenet.load().then(model => {
          // Classify the image.
          model.classify(img).then(predictions => {
            console.log('Predictions: ');
            console.log(predictions);
          });
        });

    }

    destroy() {

        $("#inference_update_btn").off("click");
    }
}