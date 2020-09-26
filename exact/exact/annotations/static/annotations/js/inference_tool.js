

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
        } else if (sel.value == 'retina-net') {
            document.getElementById("submit_inference_btn").disabled = true;

            // Empty array of vectors.
            this.array_vectors.splice(0, this.array_vectors.length);

            // Get original container size
            var containerSize = this.viewer.viewport.containerSize;
            var originalCSx = containerSize.x;
            var originalCSy = containerSize.y;
            
            // Fit the image into container
            var viewportBounds = this.viewer.viewport.getBounds();
            var tiledImage = this.viewer.world.getItemAt(0); 
            var imageBounds = tiledImage.viewportToImageRectangle(viewportBounds);
            imageBounds.width = originalCSx;
            imageBounds.height = originalCSy;
            var newBounds = this.viewer.viewport.imageToViewportRectangle(imageBounds.x, imageBounds.y, imageBounds.width, imageBounds.height);
            this.viewer.viewport.fitBounds(newBounds);

            // Load fitted image
            const img = this.viewer.canvas.children[0];
            const ctx = img.getContext("2d");

            var originalTensor = tf.browser.fromPixels(img);

            originalTensor = tf.cast(originalTensor, 'float32').div(tf.scalar(255));
            const mean = tf.tensor2d([0.917576, 0.91688, 0.92946], [1, 3]);
            const std = tf.tensor2d([0.132308, 0.103768, 0.068725], [1, 3]);
            originalTensor = originalTensor.sub(mean).div(std);
            originalTensor = originalTensor.transpose([2, 0, 1]); //C, H, W

            // Crop the image if necessary
            if (originalCSx > 1024) {
                originalTensor = originalTensor.slice([0, 0, 0], [-1, -1, 1024]);
            };
            if (originalCSy > 1024) {
                originalTensor = originalTensor.slice([0, 0, 0], [-1, 1024, -1]);
            };

            const imageWidth = originalTensor.shape[2];
            const imageHeight = originalTensor.shape[1];

            // Pad the image to fit 1024x1024
            const padWidth = 1024 - imageWidth;
            const padHeight = 1024 - imageHeight;
            const padding = [[0, 0], [0, padHeight], [0, padWidth]];
            var paddedTensor = originalTensor.pad(padding).expandDims();

            async function init() {
                const modelUrl = 'https://storage.googleapis.com/exact-object-detection/web_model/model.json';
                const model = await tf.loadGraphModel(modelUrl);
                const outputTensor = model.predict(paddedTensor);
                document.getElementById("inf_card").innerHTML = "Model running, please wait";
                console.log(outputTensor);
                model.dispose;

                var class_pred = outputTensor[1];
                var bbox_pred = outputTensor[2];
                class_pred = class_pred.squeeze().sigmoid();
                const class_pred_max = class_pred.max(1);
                
                const threshold = tf.tensor1d([0.5]);
                const detect_mask = class_pred_max.greater(threshold);

                // activ_to_bbox
                const anchors = tf.tensor2d(returnAnchors());
                bbox_pred = bbox_pred.squeeze().mul(tf.tensor2d([[0.1, 0.1, 0.2, 0.2]]));
                var centers = anchors.slice([0, 2], [-1, -1]).mul(bbox_pred.slice([0, 0], [-1, 2])).add(anchors.slice([0, 0], [-1, 2]));
                var sizes = anchors.slice([0, 2], [-1, -1]).mul(bbox_pred.slice([0, 2], [-1, -1]).exp());
                bbox_pred= centers.concat(sizes, -1);

                
                class_pred = await tf.booleanMaskAsync(class_pred, detect_mask);
                bbox_pred = await tf.booleanMaskAsync(bbox_pred, detect_mask);

                // ctwh2tlbr
                const top_left = bbox_pred.slice([0, 0], [-1, 2]).sub((bbox_pred.slice([0, 2], [-1, -1]).div(tf.scalar(2))));
                const bot_right = bbox_pred.slice([0, 0], [-1, 2]).add((bbox_pred.slice([0, 2], [-1, -1]).div(tf.scalar(2))));
                bbox_pred = top_left.concat(bot_right, -1).clipByValue(-1, 1);

                var scores = class_pred.max(1);
                var preds = class_pred.argMax(1);

                // nms
                const selectedIndices = await tf.image.nonMaxSuppressionAsync(bbox_pred, scores, 50, 0.9, 0.55);
                scores = scores.gather(selectedIndices);
                preds = preds.gather(selectedIndices);
                bbox_pred = bbox_pred.gather(selectedIndices);

                // tlbr2cthw
                centers = (bbox_pred.slice([0, 0], [-1, 2]).add(bbox_pred.slice([0, 2], [-1, -1]))).div(tf.scalar(2));
                sizes = bbox_pred.slice([0, 2], [-1, -1]).sub(bbox_pred.slice([0, 0], [-1, 2]));
                bbox_pred = centers.concat(sizes, -1);

                console.log('Break');

                // rescale box
                const t_sz = tf.tensor2d([1024, 1024], [1, 2]);
                var bbox_left = bbox_pred.slice([0, 0], [-1, 2]).sub((bbox_pred.slice([0, 2], [-1, -1]).div(tf.scalar(2))));
                bbox_left = (bbox_left.slice([0, 0], [-1, 2]).add(tf.scalar(1))).mul(t_sz).div(tf.scalar(2));
                const bbox_right = bbox_pred.slice([0, 2], [-1, -1]).mul(t_sz).div(tf.scalar(2));
                bbox_pred = bbox_left.concat(bbox_right, -1);

                const length = preds.size;

                // Convert tensors to arrays
                bbox_pred = await bbox_pred.array();
                scores = await scores.array();
                preds = await preds.array();

                // Draw boxes 
                ctx.strokeStyle = "#00FFFF";
                ctx.lineWidth = 4;
                for (var i = 0; i < length; i++) {
                    if (!(anno.selectedIndex == preds[i])) {
                        continue;
                    };

                    const y = bbox_pred[i][0];
                    const x = bbox_pred[i][1];
                    const height = bbox_pred[i][2];
                    const width = bbox_pred[i][3];
                    ctx.strokeRect(x, y, width, height);

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
                };
                document.getElementById("inf_card").innerHTML = "Object detection completed";
                if (this.array_vectors.length > 0) {
                    document.getElementById("submit_inference_btn").disabled = false;
                };

                return;
            };
            document.getElementById("inf_card").innerHTML = "Downloading Model";
            let retinaNet = init.bind(this);
            retinaNet();
        } else if (sel.value == 'asthma') {
            document.getElementById("submit_inference_btn").disabled = true;

            // Empty array of vectors.
            this.array_vectors.splice(0, this.array_vectors.length);

            // Get original container size
            var containerSize = this.viewer.viewport.containerSize;
            var originalCSx = containerSize.x;
            var originalCSy = containerSize.y;
            
            // Fit the image into container
            var viewportBounds = this.viewer.viewport.getBounds();
            var tiledImage = this.viewer.world.getItemAt(0); 
            var imageBounds = tiledImage.viewportToImageRectangle(viewportBounds);
            imageBounds.width = originalCSx;
            imageBounds.height = originalCSy;
            var newBounds = this.viewer.viewport.imageToViewportRectangle(imageBounds.x, imageBounds.y, imageBounds.width, imageBounds.height);
            this.viewer.viewport.fitBounds(newBounds);

            // Load fitted image
            const img = this.viewer.canvas.children[0];
            const ctx = img.getContext("2d");

            var originalTensor = tf.browser.fromPixels(img);

            originalTensor = tf.cast(originalTensor, 'float32').div(tf.scalar(255));
            const mean = tf.tensor2d([0.885901, 0.85915, 0.893695], [1, 3]);
            const std = tf.tensor2d([0.144371, 0.191175, 0.119497], [1, 3]);
            originalTensor = originalTensor.sub(mean).div(std);
            originalTensor = originalTensor.transpose([2, 0, 1]); //C, H, W

            // Crop the image if necessary
            if (originalCSx > 1024) {
                originalTensor = originalTensor.slice([0, 0, 0], [-1, -1, 1024]);
            };
            if (originalCSy > 1024) {
                originalTensor = originalTensor.slice([0, 0, 0], [-1, 1024, -1]);
            };

            const imageWidth = originalTensor.shape[2];
            const imageHeight = originalTensor.shape[1];

            // Pad the image to fit 1024x1024
            const padWidth = 1024 - imageWidth;
            const padHeight = 1024 - imageHeight;
            const padding = [[0, 0], [0, padHeight], [0, padWidth]];
            var paddedTensor = originalTensor.pad(padding).expandDims();

            async function init() {
                const modelUrl = 'https://storage.googleapis.com/exact-object-detection/asthma_model/model.json';
                const model = await tf.loadGraphModel(modelUrl);
                const outputTensor = await model.executeAsync(paddedTensor);
                document.getElementById("inf_card").innerHTML = "Model running, please wait";
                console.log(outputTensor);
                model.dispose;

                var class_pred = outputTensor[3];
                var bbox_pred = outputTensor[0];
                class_pred = class_pred.squeeze().sigmoid();
                const class_pred_max = class_pred.max(1);
                
                const threshold = tf.tensor1d([0.5]);
                const detect_mask = class_pred_max.greater(threshold);

                // activ_to_bbox
                const anchors = tf.tensor2d(returnAsthmaAnchors());
                bbox_pred = bbox_pred.squeeze().mul(tf.tensor2d([[0.1, 0.1, 0.2, 0.2]]));
                var centers = anchors.slice([0, 2], [-1, -1]).mul(bbox_pred.slice([0, 0], [-1, 2])).add(anchors.slice([0, 0], [-1, 2]));
                var sizes = anchors.slice([0, 2], [-1, -1]).mul(bbox_pred.slice([0, 2], [-1, -1]).exp());
                bbox_pred= centers.concat(sizes, -1);

                
                class_pred = await tf.booleanMaskAsync(class_pred, detect_mask);
                bbox_pred = await tf.booleanMaskAsync(bbox_pred, detect_mask);

                // ctwh2tlbr
                const top_left = bbox_pred.slice([0, 0], [-1, 2]).sub((bbox_pred.slice([0, 2], [-1, -1]).div(tf.scalar(2))));
                const bot_right = bbox_pred.slice([0, 0], [-1, 2]).add((bbox_pred.slice([0, 2], [-1, -1]).div(tf.scalar(2))));
                bbox_pred = top_left.concat(bot_right, -1).clipByValue(-1, 1);

                var scores = class_pred.max(1);
                var preds = class_pred.argMax(1);

                // nms
                const selectedIndices = await tf.image.nonMaxSuppressionAsync(bbox_pred, scores, 50, 0.9, 0.55);
                scores = scores.gather(selectedIndices);
                preds = preds.gather(selectedIndices);
                bbox_pred = bbox_pred.gather(selectedIndices);

                // tlbr2cthw
                centers = (bbox_pred.slice([0, 0], [-1, 2]).add(bbox_pred.slice([0, 2], [-1, -1]))).div(tf.scalar(2));
                sizes = bbox_pred.slice([0, 2], [-1, -1]).sub(bbox_pred.slice([0, 0], [-1, 2]));
                bbox_pred = centers.concat(sizes, -1);

                console.log('Break');

                // rescale box
                const t_sz = tf.tensor2d([1024, 1024], [1, 2]);
                var bbox_left = bbox_pred.slice([0, 0], [-1, 2]).sub((bbox_pred.slice([0, 2], [-1, -1]).div(tf.scalar(2))));
                bbox_left = (bbox_left.slice([0, 0], [-1, 2]).add(tf.scalar(1))).mul(t_sz).div(tf.scalar(2));
                const bbox_right = bbox_pred.slice([0, 2], [-1, -1]).mul(t_sz).div(tf.scalar(2));
                bbox_pred = bbox_left.concat(bbox_right, -1);

                const length = preds.size;

                // Convert tensors to arrays
                bbox_pred = await bbox_pred.array();
                scores = await scores.array();
                preds = await preds.array();

                // Draw boxes 
                ctx.strokeStyle = "#00FFFF";
                ctx.lineWidth = 4;
                for (var i = 0; i < length; i++) {
                    if (!(anno.selectedIndex == preds[i])) {
                        continue;
                    };

                    const y = bbox_pred[i][0];
                    const x = bbox_pred[i][1];
                    const height = bbox_pred[i][2];
                    const width = bbox_pred[i][3];
                    ctx.strokeRect(x, y, width, height);

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
                };
                document.getElementById("inf_card").innerHTML = "Object detection completed";
                if (this.array_vectors.length > 0) {
                    document.getElementById("submit_inference_btn").disabled = false;
                };

                return;
            };
            document.getElementById("inf_card").innerHTML = "Downloading Model";
            let asthmaNet = init.bind(this);
            asthmaNet();
        };
    }

    submitInference(event) {
        var sel = document.getElementById('inference_select');
        if (sel.value == 'object-detection') {
            this.viewer.raiseEvent('add_detected_bounding_boxes', {});
        } else if (sel.value == 'segmentation') {
            this.viewer.raiseEvent('add_polygon_from_segmentation', {});
        } else if (sel.value == 'retina-net') {
            this.viewer.raiseEvent('add_detected_bounding_boxes', {});
        } else if (sel.value == 'asthma') {
            this.viewer.raiseEvent('add_detected_bounding_boxes', {});
        }
    }

    destroy() {

        $("#inference_update_btn").off("click");
        $("#submit_inference_btn").off("click");
    };
};