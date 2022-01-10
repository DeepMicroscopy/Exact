
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
    }

    initBrowserSycEvents() {

        this.getChannelObject("ReceiveImageInformation").onmessage = 
                    this.setImageInformation.bind(this);

        this.getChannelObject("GetImageInformation").onmessage = 
                    this.sendImageInformation.bind(this);

        $("#sync_browser_image").on("change",this.createRegistration.bind(this));
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
        $('#sync_browser_image').empty();

        for(let channel of Object.values(this.channels)) {
            channel.close();
        }
    }


}