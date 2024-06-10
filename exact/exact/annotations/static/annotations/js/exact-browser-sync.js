
class FakeBroadcastChannel {

    constructor(channelName) {
        this.channelName = channelName;
        this.onmessage = undefined;
    }

    postMessage(message) { }

    close() { }
}

class EXACTBrowserSync {

    constructor(source_image, viewer, exact_registration_sync) {

        $("#open_registration_image_visibility").hide();
        this.source_image = source_image;
        this.exact_registration_sync = exact_registration_sync;
        this.openTabImageInformations = {};
        this.registration = undefined;
        this.viewer = viewer;

        this.channels = {};
        this.initUiEvents();
        this.initBrowserSycEvents();

        viewer.addHandler("sync_RegistrationLoaded", function (event) {

            event.userData.requestAllOpenImages();
        }, this);


        viewer.addHandler("sync_TabAnnotationCreated", function (event) {

            event.userData.getChannelObject("SendCreatedOrUpdateAnnotation").postMessage({
                "annotation": event.anno,
                "imageId": event.userData.source_image.id,
                "image_name": event.userData.source_image.name,
            });     

        }, this);

        
        viewer.addHandler("sync_TabAnnotationUpdated", function (event) {

            event.userData.getChannelObject("SendCreatedOrUpdateAnnotation").postMessage({
                "annotation": event.anno,
                "imageId": event.userData.source_image.id,
                "image_name": event.userData.source_image.name,
            });     

        }, this);


        viewer.addHandler("sync_TabAnnotationDeleted", function (event) {

            event.userData.getChannelObject("SendDeletedAnnotation").postMessage({
                "annotation": event.anno,
                "imageId": event.userData.source_image.id,
                "image_name": event.userData.source_image.name,
            });     

        }, this);

    }

    initBrowserSycEvents() {

        this.getChannelObject("ReceiveImageInformation").onmessage = 
                    this.setImageInformation.bind(this);

        this.getChannelObject("GetImageInformation").onmessage = 
                    this.sendImageInformation.bind(this);

        $("#sync_browser_image").on("change",this.imageHandlerSelection.bind(this));
    }

    imageHandlerSelection(event) {
        
        let backgroundColor = $("select#sync_browser_image option:selected").css("background-color");

        if (backgroundColor == "rgb(0, 0, 255)") {
            this.createOverlayOpacity(event);
        }
        else {
            this.createRegistration(event);
        }
    }

    createOverlayOpacity(event) {
        var selectElement = document.getElementById('sync_browser_image');
        var selectedOption = selectElement.options[selectElement.selectedIndex];

        var selectedImageId = selectedOption.getAttribute('data-image_id');
        var selectedImageName = selectedOption.label;

        this.openTabImageInformations[selectedImageId] = selectedImageName;

        if (this.registration !== undefined) {
            this.registration.destroy();
        }

        var imageInfo = new Map();

        imageInfo.set('target_image_id', this.source_image.id);
        imageInfo.set('target_image_name', this.source_image.name);
        imageInfo.set('source_image_id', selectedImageId);
        imageInfo.set('source_image_name', selectedImageName);

        this.registration = new EXACTOverlayOpacityHandler(this.viewer, imageInfo, this);
    }

    createRegistration(event) {
        let registration_pair = this.exact_registration_sync.registeredImagePairs[$( "select#sync_browser_image").val()];

        if(registration_pair === undefined || registration_pair.target_image.id !== this.source_image.id) {
            let source_image = Object.values(Object.fromEntries(Object.entries(this.openTabImageInformations)
                                    .filter(([k,v]) => v.name===$( "select#sync_browser_image" ).val())))[0];

            if (source_image !== undefined) {
                registration_pair = this.exact_registration_sync.createRegistrationPair(source_image);
            } else{
                $("#open_registration_image_visibility").hide();
                this.registration = undefined;
                return 
            }
            
        }

        this.openTabImageInformations[registration_pair.source_image.id] = registration_pair.source_image;

        $("#open_registration_image_visibility").show();
        $("#open_registration_image").attr("href",include_server_subdir("/annotations/" + registration_pair.source_image.id + "/"));

        if (this.registration !== undefined) {
            this.registration.destroy();
        }

        this.registration = new EXACTRegistrationHandler(this.viewer, registration_pair, this);
    }

    initUiEvents() {

        $('#search_browserimages_btn').click(this.requestAllOpenImages.bind(this)); 
    }

    requestAllOpenImages() {

        // set all registration pairs at UI
        $('#sync_browser_image').empty();
        let image_list =  $('#sync_browser_image');

        for (let registration_pair of Object.values(this.exact_registration_sync.registeredImagePairs)) {
            image_list.append(`<option style="background-color: green"
                                        data-image_id=${registration_pair.source_image.id}>
                                    ${registration_pair.source_image.name}
                                </option>`);
        }

        // set all segmentation pairs at UI
        var imageListDiv = document.getElementById('image_list');
        var imageLinks = imageListDiv.getElementsByTagName('a');

        for (var i = 0; i < imageLinks.length; i++) {
            var imageName = imageLinks[i].textContent.trim();
            imageName = imageName.replace(/\s/g, '');
            imageName = imageName.replace(/\n/g, '');
            var imageId = imageLinks[i].getAttribute('data-image_id');

            var name1 = this.source_image.name.split('.').slice(0, -1).join('.');
            var name2 = imageName.split('.').slice(0, -1).join('.');
        
            if (name1 === name2 && this.source_image.name !== imageName) {
                image_list.append(`<option style="background-color: blue"
                                        data-image_id=${imageId}>
                                        ${imageName}
                                    </option>`);
            }
        }

        if($('#sync_browser_image > option').length >= 1) {
            $("#sync_browser_image").trigger("change");
        }

        this.getChannelObject("GetImageInformation").postMessage({
            "request": "getImageInformation"
        });
    }

    sendImageInformation(e) {
        this.getChannelObject("ReceiveImageInformation").postMessage({
            "imageInformation": this.source_image
        });
    }
    
    sendCurrentViewPortCoordinates(coordinates) {
        this.getChannelObject("ImageViewPort").postMessage({
            "imageId": this.source_image.id,
            "image_name": this.source_image.name,
            "x_min": coordinates.x_min, 
            "y_min": coordinates.y_min,
            "x_max": coordinates.x_max,
            "y_max": coordinates.y_max,
        });
    }

    setImageInformation(event) {

        if (!(event.data.imageInformation.id in this.openTabImageInformations) 
                && !(event.data.imageInformation.name in this.exact_registration_sync.registeredImagePairs)) {
            this.openTabImageInformations[event.data.imageInformation.id] = event.data.imageInformation;
        
            let image_list =  $('#sync_browser_image');
            image_list.append(`<option data-image_id=${event.data.imageInformation.id}>${event.data.imageInformation.name}</option>`);

            if($('#sync_browser_image > option').length == 1) {
                $("#sync_browser_image").trigger("change");
            }
        
        }
    }

    getChannelObject(channelName) {

        let channel = null;
        if (channelName in this.channels) {
            channel = this.channels[channelName];
        } else {
            this.channels[channelName] = this._createNewChannel(channelName);
            channel = this.channels[channelName];

        }

        return channel;
    }

    _createNewChannel(channelName) {

        try {
            return new BroadcastChannel(channelName);
        } catch (error) {
            console.error(error);

            return new FakeBroadcastChannel(channelName);
        }

    }

    onNewChannelMessage(messageEvent) {

    }

    //postMessage(message) {
    //    this.channel.postMessage(message);
    //}


    destroy() {

        if(this.registration !== undefined) {
            this.registration.destroy();
        }

        $("#search_browserimages_btn").off("click");
        $("#sync_browser_image").off("change");
        $('#sync_browser_image').empty();

        for(let channel of Object.values(this.channels)) {
            channel.close();
        }
    }


}