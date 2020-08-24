

class InferenceTool {

    constructor (imageInformation, user_id, gHeaders, viewer) {

        this.imageInformation = imageInformation;
        this.imageid = imageInformation['id'];
        this.gHeaders = gHeaders;
        this.viewer = viewer;
        this.user_id = user_id;

        this.initUiEvents(this);

        this.array_vectors = [];
    }

    initUiEvents(context) {

        $("#inference_update_btn").click(this.performInference.bind(this));
        $("#submit_inference_btn").click(this.submitInference.bind(this));

    }

    performInference(event) {
        
        // Load image from current viewer
        const img = this.viewer.canvas.children[0];
        const ctx = img.getContext("2d");

        // Check which inference task
        var sel = document.getElementById('inference_select');
        
        if (sel.value == 'classification') {
            // Load the model.
            document.getElementById("inf_card").innerHTML = "Loading model"; 
            mobilenet.load().then(model => {
                // Classify the image.
                model.classify(img).then(predictions => {
                    document.getElementById("inf_card").innerHTML = "Classification completed"; 
                    //document.getElementById("inf_result_card").innerHTML = predictions[0].className;
                    console.log('Predictions: ');
                    console.log(predictions);
                });
            });
        } else if (sel.value == 'object-detection') {
            // Empty array of vectors.
            this.array_vectors.splice(0, this.array_vectors.length);

            // Load the model.
            document.getElementById("inf_card").innerHTML = "Loading model"; 
            cocoSsd.load().then(model => {
                // detect objects in the image.
                model.detect(img).then(predictions => { 
                    console.log('Predictions: ', predictions);
                    const font = "16px sans-serif";
                    ctx.font = font;
                    ctx.textBaseline = "top"
                    predictions.forEach(prediction => {
                        const x = prediction.bbox[0];
                        const y = prediction.bbox[1];
                        const width = prediction.bbox[2];
                        const height = prediction.bbox[3];
                        // Draw the bounding box.
                        ctx.strokeStyle = "#00FFFF";
                        ctx.lineWidth = 4;
                        ctx.strokeRect(x, y, width, height);

                        // Insert label on top left of bounding box.
                        ctx.fillStyle = "#00FFFF";
                        const textWidth = ctx.measureText(prediction.class).width;
                        const textHeight = parseInt(font, 10); // base 10
                        ctx.fillRect(x, y, textWidth + 4, textHeight + 4);
                        ctx.fillStyle = "#000000";
                        ctx.fillText(prediction.class, x, y);

                        // Convert bounding box coordinates to image coordinates.
                        var topLeft = new OpenSeadragon.Point(x, y);
                        topLeft = this.viewer.viewport.pointFromPixel(topLeft);
                        topLeft = this.viewer.viewport.viewportToImageCoordinates(topLeft);
                        var bottomRight = new OpenSeadragon.Point(x + width, y + height);
                        bottomRight = this.viewer.viewport.pointFromPixel(bottomRight);
                        bottomRight = this.viewer.viewport.viewportToImageCoordinates(bottomRight);
                        var vector = {};
                        vector["topleft"] = topLeft;
                        vector["bottomright"] = bottomRight;
                        this.array_vectors.push(vector);
                    });
                    document.getElementById("inf_card").innerHTML = "Object detection completed";
                    if (this.array_vectors.length > 0) {
                        document.getElementById("submit_inference_btn").disabled = false;
                    };
                });
            });

        } else if (sel.value == 'segmentation') {

        }
    }

    submitInference(event) {
        this.viewer.raiseEvent('add_detected_bounding_boxes', {});
    }

    destroy() {

        $("#inference_update_btn").off("click");
        $("#submit_inference_btn").off("click");
    }
}