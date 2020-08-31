

class InferenceTool {

    constructor (imageInformation, user_id, gHeaders, viewer) {

        this.imageInformation = imageInformation;
        this.imageid = imageInformation['id'];
        this.gHeaders = gHeaders;
        this.viewer = viewer;
        this.user_id = user_id;

        this.initUiEvents(this);

        this.array_vectors = [];
        this.array_poly_coordinates = [];
    }

    initUiEvents(context) {

        $("#inference_update_btn").click(this.performInference.bind(this));
        $("#submit_inference_btn").click(this.submitInference.bind(this));

    }

    performInference(event) {
        // Get current selected annotation label
        var anno = document.getElementById("annotation_type_id");
        var label = anno.options[anno.selectedIndex].text;
        
        // Load image from current viewer
        const img = this.viewer.canvas.children[0];
        const ctx = img.getContext("2d");

        // Check which inference task
        var sel = document.getElementById('inference_select');
        
        if (sel.value == 'classification') {
            document.getElementById("submit_inference_btn").disabled = true;

            // Load the model.
            document.getElementById("inf_card").innerHTML = "Loading model"; 
            mobilenet.load().then(model => {
                // Classify the image.
                model.classify(img).then(predictions => {
                    document.getElementById("inf_card").innerHTML = "Classification completed"; 
                    var txt = [];
                    for (var i = 0; i < predictions.length; i++) {
                        txt[i] = predictions[i].className + " " + Math.round(predictions[i].probability * 100) + "%"
                    }
                    document.getElementById("inf_result_card").innerHTML = txt.join("; ");
                    console.log('Predictions: ');
                    console.log(predictions);
                });
            });
        } else if (sel.value == 'object-detection') {
            document.getElementById("submit_inference_btn").disabled = true;

            // Empty array of vectors.
            this.array_vectors.splice(0, this.array_vectors.length);

            // Clear result text
            document.getElementById("inf_result_card").innerHTML = "";

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
                        // Check if bounding box class is same as annotation label
                        // if not, skip the bounding box
                        if (!label.toLowerCase().includes(prediction.class.toLowerCase())) {
                            return;
                        };
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
                        const txt = prediction.class + " " + Math.round(prediction.score * 100) + "%";
                        const textWidth = ctx.measureText(txt).width;
                        const textHeight = parseInt(font, 10); // base 10
                        ctx.fillRect(x, y, textWidth + 4, textHeight + 4);
                        ctx.fillStyle = "#000000";
                        ctx.fillText(txt, x, y);

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
            document.getElementById("submit_inference_btn").disabled = true;

            // Empty array of coordinates
            this.array_poly_coordinates.splice(0, this.array_poly_coordinates.length);

            // Clear result text
            document.getElementById("inf_result_card").innerHTML = "";

            // Load the model
            document.getElementById("inf_card").innerHTML = "Loading model"; 
            const modelName = 'pascal';   // set to your preferred model, either `pascal`, `cityscapes` or `ade20k`
            const quantizationBytes = 2;  // either 1, 2 or 4
            const cmap = deeplab.getColormap(modelName);
            const classLabels = deeplab.getLabels(modelName);
            console.log(classLabels);
            deeplab.load({base: modelName, quantizationBytes}).then(model => {
                let predictions  = model.predict(img);

                /*
                Class Labels for Pascal Segmentation Model
                Dog: 12
                Cat: 8
                */

                var classId;
                // Check if dog or cat
                if (label.toLowerCase().includes("dog")) {
                    classId = 12;
                } else if (label.toLowerCase().includes("cat")) {
                    classId = 8;
                } else {
                    classId = 0;
                };


                // Filter in only the the predictions that match the label
                const classTensor = tf.fill(predictions.shape, classId, 'int32');
                const mask = tf.equal(predictions, classTensor);
                const zero_tensor = tf.zerosLike(predictions);
                predictions = tf.where(mask, classTensor, zero_tensor);

                // Convert segmentation map to colour-labelled image
                deeplab.toSegmentationImage(cmap, classLabels, predictions).then(colourLabelledImage=> {
                    const segmentationImage = new ImageData(
                        colourLabelledImage.segmentationMap, predictions.shape[1], predictions.shape[0]); 

                    // Create second canvas to render segmentation image
                    var renderer = document.createElement('canvas');
                    renderer.width = predictions.shape[1];
                    renderer.height = predictions.shape[0];
                    renderer.getContext('2d').putImageData(segmentationImage, 0, 0);

                    // Create third canvas to rescale segmentation image to EXACT viewer size
                    var rescaler = document.createElement('canvas');
                    rescaler.width = img.width;
                    rescaler.height = img.height;
                    const rscl = rescaler.getContext('2d');
                    rscl.drawImage(renderer, 0, 0, img.width, img.height);

                    // Rescale the segmentation map to EXACT viewer size
                    //ctx.drawImage(rescaler, 0, 0, img.width, img.height);

                    // Find Contours
                    var src = cv.imread(rescaler);
                    var dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
                    cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
                    var contours = new cv.MatVector();
                    var hierarchy = new cv.Mat();
                    cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
                    for (let i = 0; i < contours.size(); ++i) {
                        let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255),
                                                  Math.round(Math.random() * 255));
                        cv.drawContours(dst, contours, i, color, 1, cv.LINE_8, hierarchy, 100);
                    }
                    
                    // Extract contours' coordinates and draw them on canvas
                    ctx.strokeStyle = "#00FFFF";
                    const numContours = hierarchy.cols;
                    for (var i = 0; i < numContours; i++) {
                        const numCoordinates = contours.get(i).size().height;
                        var coordinates = new Array(numCoordinates);
                        ctx.beginPath();
                        var j = 0;
                        var x = contours.get(i).intPtr(j)[0];
                        var y = contours.get(i).intPtr(j)[1];
                        ctx.moveTo(x, y);
                        var coor = new OpenSeadragon.Point(x, y);
                        coor = this.viewer.viewport.pointFromPixel(coor);
                        coor = this.viewer.viewport.viewportToImageCoordinates(coor);
                        coordinates[j] = coor;

                        for (j = 1; j < numCoordinates; j++) {
                            x = contours.get(i).intPtr(j)[0];
                            y = contours.get(i).intPtr(j)[1];
                            ctx.lineTo(x, y);
                            var coor = new OpenSeadragon.Point(x, y);
                            coor = this.viewer.viewport.pointFromPixel(coor);
                            coor = this.viewer.viewport.viewportToImageCoordinates(coor);
                            coordinates[j] = coor;
                        };

                        ctx.closePath();
                        ctx.stroke();

                        this.array_poly_coordinates.push(coordinates);
                    };
                    document.getElementById("inf_card").innerHTML = "Segmentation completed"; 
                    if (this.array_poly_coordinates.length > 0) {
                        document.getElementById("submit_inference_btn").disabled = false;
                    };

                });

                /*
                model.segment(img, img).then(predictions=> {
                    console.log(`The predicted classes are ${JSON.stringify(predictions.legend)}`);
                    var segmentationImage = new ImageData(predictions.segmentationMap, predictions.width, predictions.height);

                    // Create second canvas to render segmentation map
                    var renderer = document.createElement('canvas');
                    renderer.width = predictions.width;
                    renderer.height = predictions.height;
                    renderer.getContext('2d').putImageData(segmentationImage, 0, 0);

                    // Create third canvas to rescale segmentation map back to original size
                    var rescaler = document.createElement('canvas');
                    rescaler.width = img.width;
                    rescaler.height = img.height;
                    const rscl = rescaler.getContext('2d');
                    rscl.drawImage(renderer, 0, 0, img.width, img.height);

                    // Rescale the segmentation map to EXACT viewer size
                    //ctx.drawImage(rescaler, 0, 0, img.width, img.height);

                    // Find Contours
                    var src = cv.imread(rescaler);
                    var dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
                    cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
                    var contours = new cv.MatVector();
                    var hierarchy = new cv.Mat();
                    cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

                    // Draw Contours
                    for (let i = 0; i < contours.size(); ++i) {
                        let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255),
                                                  Math.round(Math.random() * 255));
                        cv.drawContours(dst, contours, i, color, 1, cv.LINE_8, hierarchy, 100);
                    }
                    
                    //cv.imshow(img, dst);
                    ctx.strokeStyle = "#00FFFF";

                    // Extract contours' coordinates
                    const numContours = hierarchy.cols;
                    for (var i = 0; i < numContours; i++) {
                        const numCoordinates = contours.get(i).size().height;
                        var coordinates = new Array(numCoordinates);
                        ctx.beginPath();
                        var j = 0;
                        var x = contours.get(i).intPtr(j)[0];
                        var y = contours.get(i).intPtr(j)[1];

                        ctx.moveTo(x, y);

                        var coor = new OpenSeadragon.Point(x, y);
                            coor = this.viewer.viewport.pointFromPixel(coor);
                            coor = this.viewer.viewport.viewportToImageCoordinates(coor);
                            coordinates[j] = coor;


                        for (j = 1; j < numCoordinates; j++) {
                            x = contours.get(i).intPtr(j)[0];
                            y = contours.get(i).intPtr(j)[1];

                            ctx.lineTo(x, y);

                            var coor = new OpenSeadragon.Point(x, y);
                            coor = this.viewer.viewport.pointFromPixel(coor);
                            coor = this.viewer.viewport.viewportToImageCoordinates(coor);
                            coordinates[j] = coor;
                        };

                        ctx.closePath();
                        ctx.stroke();

                        this.array_poly_coordinates.push(coordinates);
                    };
                    document.getElementById("inf_card").innerHTML = "Segmentation completed"; 
                    if (this.array_poly_coordinates.length > 0) {
                        document.getElementById("submit_inference_btn").disabled = false;
                    };
                });
                */
            });
        };
    }

    submitInference(event) {
        var sel = document.getElementById('inference_select');
        if (sel.value == 'object-detection') {
            this.viewer.raiseEvent('add_detected_bounding_boxes', {});
        } else if (sel.value == 'segmentation') {
            this.viewer.raiseEvent('add_polygon_from_segmentation', {});
        }
    }

    destroy() {

        $("#inference_update_btn").off("click");
        $("#submit_inference_btn").off("click");
    }
}