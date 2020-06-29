// JS file for handling the imageset UI components

class EXACTImageSetViewer {

    constructor(image_set_id, image_id, image_url, gHeaders, user_id) {

        this.image_set_id = image_set_id;
        this.gHeaders = gHeaders;
        this.user_id = user_id;
        this.image_id = image_id;
        this.image_url = image_url;
        this.ready = false; // true if alle needed informations are loaded from EXACT

        this.exact_viewer;

        this.exact_imageset_sync = new EXACTImageSetSync(image_set_id, gHeaders);
        this.exact_imageset_sync.loadImageSetInformation(this.imageSetInformationLoaded.bind(this), this.exact_imageset_sync)
    
        this.imageInformation = {};
        this.filteredImageInformation = {}

        this.initUiEvents();
    }

    handleKeyUp(event) {

        switch (event.keyCode) {
            case 69: //e load next image
                this.loadAdjacentImage(1);
                break;
            case 81: //q load last image
                this.loadAdjacentImage(-1);
                break;
        }
    }

    initUiEvents() {

        $(document).keyup(this.handleKeyUp.bind(this));

        $('#back_button').click(this.loadLast.bind(this));
        $('#next_button').click(this.verifyAndLoadNext.bind(this));
        $('#skip_button').click(this.skip.bind(this));

        $('select#filter_images').on('change', this.filterImageList.bind(this));
        $('#filter_update_btn').on('click', this.filterImageList.bind(this) );
    } 

    imageSetInformationLoaded() {
        this.ready = true;
        this.displayImage(this.image_id);

        this.imageInformation = this.exact_imageset_sync.imageInformation;

        //register for imagelists click events 
        let image_ids = Object.keys(this.imageInformation).map(x=>parseInt(x));
        for (let image_id of image_ids) {
            $('#annotate_image_link_' + image_id).click(this.imageLinkClicked.bind(this));
            $('#imageThumbnail_' + image_id).click(this.imageLinkClicked.bind(this));
        }


        this.filteredImageInformation = this.exact_imageset_sync.imageInformation;
    }

    updateFilteredImageSet (images) {

        this.filteredImageInformation = {}

        // set visibility of all image links to false
        let image_ids = Object.keys(this.imageInformation).map(x=>parseInt(x));
        for (let image_id of image_ids) {
            $('#annotate_image_link_' + image_id).hide();
            $('#imageThumbnail_' + image_id).hide();
        }

        for (let image of images) {
            this.filteredImageInformation[image.id] = this.imageInformation[image.id];
            $('#annotate_image_link_' + image.id).show();
            $('#imageThumbnail_' + image.id).show();
        }

        // detroy viewer if the filtered set is empty
        if (images.length === 0) {
            this.destroyViewer();
        } else if (this.image_id in this.filteredImageInformation === false) {
            // if current image is not in filtered images load first new image
            let first_id = Object.keys(this.filteredImageInformation).map(x=>parseInt(x))[0];
            this.displayImage(first_id);
        }
    }

    filterImageList(filter_type) {

        if (typeof filter_type === "undefined" || 
                filter_type.hasOwnProperty('originalEvent')) {
            filter_type = $('#filter_images').children(':selected').val();
        }
        
        this.exact_imageset_sync.filterImageList(filter_type, this.updateFilteredImageSet.bind(this), 
            this.image_set_id);        
    }

    destroyViewer() {
        
        // if a exact_viewer instance exists destroy
        if (this.exact_viewer !== undefined) {
            // deactivate current image link
            $('#annotate_image_link_' + this.exact_viewer.imageId).removeClass('active')
            this.exact_viewer.destroy();
        }
    }

    displayImage(imageId) {

        //if new imageid equals old image id do nothing
        if (this.exact_viewer !== undefined
            && this.exact_viewer.imageId === imageId)
            return

        this.destroyViewer();

        this.image_id = imageId;
        let image_information = this.exact_imageset_sync.imageInformation[imageId];
        let annotation_types = this.exact_imageset_sync.annotation_types;
        let collaboration_type = this.exact_imageset_sync.collaboration_type;

        $('#annotate_image_link_' + imageId).addClass('active');
        $('#active_image_name').text(image_information.name);

        const options = {};
        this.exact_viewer = EXACTViewer.factoryCreateViewer(this.image_url, this.image_id, options, 
            image_information, annotation_types, this.gHeaders, this.user_id, collaboration_type);

        this.scrollImageList(this.image_id);
    }

    imageLinkClicked(event) {
        event.preventDefault();

        let image_id = parseInt(event.currentTarget.dataset.image_id);

        this.displayImage(image_id);
    }

    skip() {
        this.loadAdjacentImage(1);
    }

    loadLast() {
        this.loadAdjacentImage(-1);
    }

    verifyAndLoadNext() {
        
        // Save current annotation first
        this.exact_viewer.finishAnnotation();
        this.exact_viewer.exact_image_sync.verifyImage();

        this.loadAdjacentImage(1);
    }

    /**
     * Load the previous or the next image
     *
     * @param offset integer to add to the current image index
     */
    loadAdjacentImage(offset) {

        let image_ids = Object.keys(this.filteredImageInformation).map(x=>parseInt(x));
        let currentIndex = image_ids.indexOf(this.image_id);
        let newIndex = currentIndex += offset;

        if (newIndex < 0) {
            this.synchronisationNotifications("info", "FirstImage")
            return;
        } else if (newIndex >= image_ids.length) {
            this.synchronisationNotifications("info", "LastImage")
        } else {
            let new_id = image_ids[newIndex];

            this.displayImage(new_id);
        }
    }

    /**
     * Scroll image list to make current image visible.
     */
    scrollImageList(image_id) {

        var imageLink = $('#annotate_image_link_' + image_id);
        var list = $('#image_list'); // UI html element

        if (imageLink.offset() !== undefined) {
            var offset = list.offset().top;
            var linkTop = imageLink.offset().top;

            // link should be (roughly) in the middle of the element
            offset += parseInt(list.height() / 2);

            list.scrollTop(list.scrollTop() + linkTop - offset);
        }
    }

    synchronisationNotifications(className, mode) {

        switch (mode) {
            case "FirstImage":
                $.notify(`This is the first image of the imageset`,
                    { position: "bottom center", className: className });
                break;
            case "LastImage":
                $.notify(`This is the last image of the imageset`,
                    { position: "bottom center", className: className });
                break;
        }
    }
}