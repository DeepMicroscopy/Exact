// JS file for sync annotations with the EXACT Server

class EXACTTeamSync {
    constructor(team_id) {
        this.team_id = team_id;
        this.name;
        this.users = {};

        this.API_1_TEAMS_BASE_URL = `/api/v1/users/teams/${team_id}/?expand=members`;
        this.loadTeamInformation(this.API_1_TEAMS_BASE_URL, this);
    }

    loadTeamInformation(url, context) {
        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data) {

                this.name = data.name;

                for (let user of data.members) {

                    context.users[user.id] = user;
                }
            }
        });
    }
}

class EXACTScreeningModeSync {
    constructor(imageId, user_id, gHeaders, viewer) {
     
        this.imageId = imageId;
        this.user_id = user_id;
        this.gHeaders = gHeaders;
        this.viewer = viewer;
        
        this.screening_mode;
        this.thumbnail_image;

        this.API_1_SCREENING_BASE_URL = '/api/v1/images/screening_modes/';
        this.API_1_IMAGES_BASE_URL = '/api/v1/images/images/'; 

        this.loadScreeningMode(imageId, user_id, this);
    }

    loadScreeningMode(imageId, user_id, context) {

        $.ajax(this.API_1_SCREENING_BASE_URL + `?image=${imageId}&user=${user_id}`, {
            type: 'GET',
            headers: context.gHeaders,
            dataType: 'json',
            success: function (screening_modes, textStatus, jqXHR) {

                for (const screening_mode of screening_modes.results) {
                    context.screening_mode = screening_mode;

                    context.viewer.raiseEvent('sync_ScreeningModeLoaded', { screening_mode });
                }

                if (context.screening_mode === undefined) {
                    context.viewer.raiseEvent('sync_ScreeningModeNotInitialised', {  });
                }
            },
            error: function () {
            }
        });
    }

    updateCurrentIndex(index) {

        this.screening_mode.current_index = index;

        let data = {
            current_index: this.screening_mode.current_index
        }

        $.ajax(this.API_1_SCREENING_BASE_URL + `${this.screening_mode.id}/?fields=id`, {
            type: 'PATCH',
            headers: this.gHeaders,
            dataType: 'json',
            data: JSON.stringify(data),
            success: function (data, textStatus, jqXHR) {
            },
            error: function () {
            }
        });
    }

    update(data) {
        let context = this;

        $.ajax(this.API_1_SCREENING_BASE_URL + `${this.screening_mode.id}/`, {
            type: 'PATCH',
            headers: this.gHeaders,
            dataType: 'json',
            data: JSON.stringify(data),
            success: function (screening_mode, textStatus, jqXHR) {

                context.screening_mode = screening_mode;
                context.viewer.raiseEvent('sync_ScreeningModeLoaded', { screening_mode });

            },
            error: function () {
            }
        });
    }

    create(data) {
        var action = 'POST';
        var url = this.API_1_SCREENING_BASE_URL;

        let context = this;
        $.ajax(url, {
            type: action, headers: this.gHeaders, dataType: 'json',
            data: JSON.stringify(data), 
            success: function (screening_mode, textStatus, jqXHR) {

                context.screening_mode = screening_mode;
                context.viewer.raiseEvent('sync_ScreeningModeLoaded', { screening_mode });

            },
            error: function () {
                $.notify(`Server ERR_CONNECTION_REFUSED`, { position: "bottom center", className: "error" });
            }
        });

    }
}

class EXACTImageSetSync {
    constructor(imageSetId, gHeaders) {
        this.imageSetId = imageSetId;
        this.gHeaders = gHeaders;

        this.annotation_types = {};
        this.imageInformation = {};
        this.main_annotation_type;

        // Collaborative = 0; COMPETITIVE = 1;
        this.collaboration_type = 0;

        this.API_1_IMAGES_BASE_URL = '/api/v1/images/';
    }

    // load needed imageset information like:
    // images, annotation types  
    loadImageSetInformation(success_notification, context) {

        $.ajax(this.API_1_IMAGES_BASE_URL + 'image_sets/' + this.imageSetId +
            '/?expand=product_set.annotationtype_set,images' +
            '&omit=product_set.imagesets,description,location,path,images.annotations,images.time', {
            type: 'GET',
            headers: this.gHeaders,
            dataType: 'json',
            success: function (image_set, textStatus, jqXHR) {

                context.collaboration_type = image_set.collaboration_type;

                for (let product of image_set.product_set) {
                    for (let annotation_type of product.annotationtype_set) {
                        annotation_type.product = { id: product.id, name: product.name }

                        context.annotation_types[annotation_type.id] = annotation_type;
                    }
                }

                if (image_set.main_annotation_type !== undefined) {
                    context.main_annotation_type = context.annotation_types[image_set.main_annotation_type];
                }


                for (let image of image_set.images) {
                    context.imageInformation[image.id] = {
                        "id": image.id, "name": image.name, "width": image.width, "height": image.height,
                        "mpp": image.mpp, "objectivePower": image.objectivePower, 'depth': image.depth, 'frames': image.frames
                    }
                }

                success_notification();
            },
            error: function () {
            }
        });
    }

    filterImageList(filter_type, success_function) {

        let url = this.API_1_IMAGES_BASE_URL + "images/?limit=10000&"
        url += 'fields=id&';

        let filter = `image_set=${this.imageSetId}&`;
        if (filter_type === "NoAnnotations")
            filter += `num_annotations_max=0&`;
        if (filter_type == "ComputerGenerated")
            filter += `image_type=1&`;
        if (filter_type == "Verified")
            filter += `verified=True&`;
        if (filter_type == "Unverified")
            filter += `verified=False&`;
        if (isNaN(parseInt(filter_type)) === false)
            filter += `annotation_type=${parseInt(filter_type)}&`;

        url += filter;

        $.ajax(url, {
            type: 'GET', headers: this.gHeaders, dataType: 'json',
            success: function (images, textStatus, jqXHR) {
                success_function(images.results);
            }
        });
    }

}

class EXACTImageSync {
    constructor(imageId, gHeaders, viewer) {

        this.viewer = viewer;
        this.imageId = imageId;
        this.gHeaders = gHeaders;

        this.API_IMAGES_BASE_URL = '/images/api/'; // TODO: Repleace with V1 version
    }

    imageOpend() {

        // notify server that the image was opend 
        $.ajax(this.API_IMAGES_BASE_URL + 'image/opened/' + this.imageId, {
            type: 'GET',
            headers: this.gHeaders
        });
    }

    imageClosed() {

        // notify server that the image was opend 
        $.ajax(this.API_IMAGES_BASE_URL + 'image/closed/' + this.imageId, {
            type: 'GET',
            headers: this.gHeaders
        });
    }

    loadStatistics(success_function, context) {
        $.ajax(this.API_IMAGES_BASE_URL + 'image/statistics/', {
            type: 'GET', headers: this.gHeaders, dataType: 'json', data: { image_id: this.imageId },
            success: function (data) {
                success_function(data, context)
            },
            error: function () {

            }
        });
    }

    // Check if navigator overlay exists or is supported
    navigatorOverlayAvailable(success_function, context) {

        $.ajax(this.API_IMAGES_BASE_URL + 'image/navigator_overlay_status/', {
            type: 'GET',
            headers: this.gHeaders,
            dataType: 'json',
            data: { image_id: this.imageId },
            success: function (data, textStatus, jqXHR) {
                // Navigator overlay exists and can be set
                if (jqXHR.status === 200) {
                    success_function(true, context)
                } else {
                    success_function(false, context)
                }
            },
            error: function () {

            }
        });
    }

    verifyImage() {

        let data = {
            image_id: this.imageId,
            state: 'accept'
        };

        $.ajax(this.API_IMAGES_BASE_URL + 'image/verify/', {
            type: 'POST',
            headers: this.gHeaders,
            dataType: 'json',
            data: JSON.stringify(data),
            success: function (data) {

            },
            error: function () {

            }
        });
    }
}


class EXACTAnnotationSync {

    constructor(annotationTypes, imageId, gHeaders,
        viewer, user_id, collaboration_type = 0, limit = 250, updateInterval = 30000) {

        this.exact_image_sync = new EXACTImageSync(imageId, gHeaders, viewer);

        this.collaboration_type = collaboration_type;
        this.interruptLoading = false; // Stop loading annotations
        this.user_id = user_id;
        this.viewer = viewer; // just for notification reasons remove later!
        this.annotations = {};
        this.global_annotations = {};
        this.annotationTypes = annotationTypes;
        this.imageId = imageId;
        this.gHeaders = gHeaders;
        this.statistics = {};
        this.resumeLoadAnnotationsCache = {}

        this.lastUpdateTimePoint = new Date(Date.now());
        this.refreshAnnotationsFromServer;
        this.upDateFromServerInterval = updateInterval;

        this.API_ANNOTATIONS_BASE_URL = '/annotations/api/';
        this.API_1_ANNOTATIONS_BASE_URL = '/api/v1/annotations/';
        this.API_1_ANNOTATION_EXPAND = 'expand=user,last_editor,uploaded_media_files&';
        this.API_1_FILTERS = 'image=' + imageId + '&'
        if (this.collaboration_type === 1) {
            this.API_1_FILTERS += "user=" + user_id + "&"
        }

        this.API_1_ANNOTATION_FIELDS = 'fields=image,annotation_type,id,vector,deleted,description,verified_by_user,uploaded_media_files,unique_identifier,remark,user.id,user.username,last_editor.id,last_editor.username&';

        this.initLoadAnnotations(annotationTypes, imageId)
        this.refreshAnnotationsFromServer = setInterval(this.refreshAnnotations(this), this.upDateFromServerInterval, this);
    }

    refreshAnnotations(context) {

        //2020-05-03+09:52:01
        var date = context.lastUpdateTimePoint;
        var time = `${
            date.getFullYear().toString().padStart(4, '0')}-${
            (date.getMonth() + 1).toString().padStart(2, '0')}-${
            date.getDate().toString().padStart(2, '0')}+${
            date.getHours().toString().padStart(2, '0')}:${
            date.getMinutes().toString().padStart(2, '0')}:${
            date.getSeconds().toString().padStart(2, '0')}`

        let filter = context.API_1_FILTERS + "last_edit_time__gte=" + time + "&";
        context.lastUpdateTimePoint = new Date(Date.now());
        let url = context.API_1_ANNOTATIONS_BASE_URL + 'annotations/?limit=50&' + filter + context.API_1_ANNOTATION_EXPAND + context.API_1_ANNOTATION_FIELDS;

        context.loadAnnotationsWithConditions(url, context.imageId, context);
    }

    getUUIDV4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    initLoadAnnotations(annotationTypes, imageId, limit = 250) {

        this.statistics_viewer = new StatisticsViewer(this.viewer, this);

        for (let annotation_type of Object.values(annotationTypes)) {

            this.statistics[annotation_type.id] = {
                total: 0,
                loaded: 0,
                finished: false,
                verified: 0,
                annotation_type: annotation_type
            }

            let filter = this.API_1_FILTERS;
            filter += 'annotation_type=' + annotation_type.id + '&';

            let url = `${this.API_1_ANNOTATIONS_BASE_URL}annotations/?limit=${limit}&${filter}${this.API_1_ANNOTATION_EXPAND}${this.API_1_ANNOTATION_FIELDS}`
            this.loadAnnotations(url, imageId, this, annotation_type)
        }
    }

    stopLoadAnnotationsCache() {
        this.interruptLoading = true;
    }

    resumeLoadAnnotationsCache() {
        this.interruptLoading = false;

        for (var annotation_type in this.resumeLoadAnnotationsCache) {
            let url = this.resumeLoadAnnotationsCache[annotation_type].url;

            loadAnnotations(url, this.imageId, this, annotation_type)
        }
    }

    loadAnnotations(url, imageId, context, annotation_type = undefined) {
        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data) {


                for (let anno of data.results) {
                    context.statistics[anno.annotation_type].total = data.count;
                    // set annoation type
                    anno.annotation_type = context.annotationTypes[anno.annotation_type];
                    context.annotations[anno.unique_identifier] = anno;
                }

                if (data.results.length > 0) {
                    let annotations = data.results;
                    context.viewer.raiseEvent('sync_drawAnnotations', { annotations });
                }

                if (data.next !== null) {
                    context.viewer.raiseEvent('sync_UpdateStatistics', {});
                    // if the image instance should load more annotation but has a stop command save the next commands
                    let url = context.API_1_ANNOTATIONS_BASE_URL + data.next.split(context.API_1_ANNOTATIONS_BASE_URL)[1]
                    if (context.interruptLoading === false) {
                        context.loadAnnotations(url, imageId, context, annotation_type)
                    } else {
                        context.resumeLoadAnnotationsCache[annotation_type] = {
                            url: url
                        }
                    }
                } else {
                    context.statistics[annotation_type.id].finished = true;
                    context.viewer.raiseEvent('sync_UpdateStatistics', {});
                }
            }
        });
    }

    loadAnnotationsWithConditions(url, imageId, context) {

        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data, textStatus, jqXHR) {

                if (jqXHR.status === 200) {

                    for (let anno of data.results) {
                        if (anno.user.id === context.user_id ||
                            anno.last_editor.id === context.user_id)
                            continue;

                        anno.annotation_type = context.annotationTypes[anno.annotation_type]

                        className = "info";
                        if (anno.description.includes('@')) {
                            className = "warn";
                        }

                        // annotation to update
                        if (anno.unique_identifier in context.annotations) {

                            if (anno.deleted) {
                                context.synchronisationNotifications(className, anno, "AnnotationDeleted")
                                context.viewer.raiseEvent('sync_AnnotationDeleted', { anno });
                            }
                            else {
                                context.synchronisationNotifications(className, anno, "AnnotationUpdated")
                                context.viewer.raiseEvent('sync_AnnotationUpdated', { anno });
                            }
                        } else {
                            let annotations = [anno];
                            context.viewer.raiseEvent('sync_drawAnnotations', { annotations });
                            context.synchronisationNotifications(className, anno, "AnnotationCreated")
                        }

                        // set annotation to values form Server
                        context.annotations[anno.unique_identifier] = anno;
                    }

                    if (data.count > 0) {
                        context.viewer.raiseEvent('sync_UpdateStatistics', {});
                    }

                    if (data.next !== null && context.interruptLoading === false) {
                        context.loadAnnotationsWithConditions(context.API_1_ANNOTATIONS_BASE_URL + data.next.split(context.API_1_ANNOTATIONS_BASE_URL)[1], imageId, context)
                    }
                }
            },
            error: function (request, status, error) {
                $.notify(`Server ERR_CONNECTION_REFUSED`, { position: "bottom center", className: "error" });
            }
        });
    }

    getAnnotation(unique_identifier) {
        return this.annotations[unique_identifier]
    }

    addAnnotationToCache(annotation) {
        this.annotations[annotation.unique_identifier] = annotation
    }

    getStatistics(data, context) {
        for (let anno_type of data.statistics) {
            if (anno_type.id in context.annotationTypes) {
                context.statistics[anno_type.id].total = anno_type.in_image_count;
                context.statistics[anno_type.id].verified = anno_type.verified_count;
            }
        }
    }

    deleteAnnotation(unique_identifier) {

        let annotation = this.annotations[unique_identifier];

        // if annotation was not in sync with the server
        if (annotation.id === -1) {
            delete this.annotations[unique_identifier];
        } else {
            annotation.deleted = true;
            this.saveAnnotation(annotation);
        }
    }

    saveAnnotation(annotation) {

        var action = 'POST';
        var url = this.API_1_ANNOTATIONS_BASE_URL + "annotations/";

        var data = {
            deleted: annotation.deleted,
            annotation_type: annotation.annotation_type.id,
            image: annotation.image,
            vector: annotation.vector,
            unique_identifier: annotation.unique_identifier
        };

        // edit instead of create
        if (annotation.id !== -1) {

            action = 'PATCH';
            data.id = annotation.id;
            url = url + annotation.id + "/";
        }

        url = url + "?" + this.API_1_ANNOTATION_EXPAND + this.API_1_ANNOTATION_FIELDS;

        let context = this;
        $.ajax(url, {
            type: action, headers: this.gHeaders, dataType: 'json',
            data: JSON.stringify(data), success: function (anno, textStatus, jqXHR) {
                if (jqXHR.status === 200) {
                    if (anno.deleted === true) {
                        context.synchronisationNotifications("info", anno, "AnnotationDeleted")
                    } else {
                        context.synchronisationNotifications("info", anno, "AnnotationUpdated")
                    }

                } else if (jqXHR.status === 201) {
                    context.synchronisationNotifications("info", anno, "AnnotationCreated")
                }
                anno.annotation_type = context.annotationTypes[anno.annotation_type]
                context.annotations[anno.unique_identifier] = anno

                context.viewer.raiseEvent('sync_UpdateStatistics', {});
            },
            error: function () {
                $.notify(`Server ERR_CONNECTION_REFUSED`, { position: "bottom center", className: "error" });
            }
        });
    }

    verifyAnnotation(annotation) {

        let data_val = {
            annotation_id: annotation.id,
            state: 'accept',
        };

        let context = this;
        $.ajax(this.API_ANNOTATIONS_BASE_URL + 'annotation/verify/', {
            type: 'POST',
            headers: this.gHeaders,
            dataType: 'json',
            data: JSON.stringify(data_val),
            success: function (data) {
                context.synchronisationNotifications("info", data.annotation, "AnnotationVerified")
            },
            error: function () {

            }
        })
    }

    synchronisationNotifications(className, anno, mode) {

        switch (mode) {
            case "AnnotationCreated":
                $.notify(`Annotation ${anno.id} was created by ${anno.last_editor.username}`,
                    { position: "bottom center", className: className });
                break;
            case "AnnotationDeleted":
                $.notify(`Annotation ${anno.id} was deleted by ${anno.last_editor.username}`,
                    { position: "bottom center", className: "info" });
                break;
            case "AnnotationUpdated":
                $.notify(`Annotation ${anno.id} was updated by ${anno.last_editor.username}`,
                    { position: "bottom center", className: className });
                break;
            case "AnnotationVerified":
                $.notify(`Annotation ${anno.id} is now verified`,
                    { position: "bottom center", className: className });
                break;
        }
    }

    destroy() {
        this.interruptLoading = true;
        clearInterval(this.clearInterval);
    }
}

class EXACTGlobalAnnotationSync extends EXACTAnnotationSync {

    constructor(annotationTypes, imageId, gHeaders,
        viewer, user_id, collaboration_type = 0, limit = 250, updateInterval = 30000) {

        super(annotationTypes, imageId, gHeaders, viewer, user_id, collaboration_type, limit, updateInterval);

        this.global_annotations = {};
    }

    initLoadAnnotations(annotationTypes, imageId, limit = 250) {

        //  get all global types
        let filter = this.API_1_FILTERS + "vector_type=7&";

        for (let annotation_type of Object.values(annotationTypes)) {

            this.statistics[annotation_type.id] = {
                total: 0,
                loaded: 0,
                finished: false,
                verified: 0,
                annotation_type: annotation_type
            }
        }

        let url = `${this.API_1_ANNOTATIONS_BASE_URL}annotations/?limit=${limit}&${filter}${this.API_1_ANNOTATION_EXPAND}${this.API_1_ANNOTATION_FIELDS}`
        this.loadAnnotations(url, imageId, this)
    }

    loadAnnotations(url, imageId, context, annotation_type = undefined) {
        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data) {

                for (let annotation of data.results) {
                    // set annoation type
                    annotation.annotation_type = context.annotationTypes[annotation.annotation_type];

                    //  New global Annotations Added                
                    context.annotations[annotation.annotation_type.id] = annotation;
                    context.statistics[annotation.annotation_type.id].finished = true;

                    context.viewer.raiseEvent('sync_GlobalAnnotations', { annotation });
                }
            }
        });
    }

    loadAnnotationsWithConditions(url, imageId, context) {

        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data, textStatus, jqXHR) {

                for (let annotation of data.results) {
                    if (annotation.user.id === context.user_id ||
                        annotation.last_editor.id === context.user_id)
                        continue;

                    annotation.annotation_type = context.annotationTypes[annotation.annotation_type]

                    className = "info";
                    if (annotation.description.includes('@')) {
                        className = "warn";
                    }

                    // annotation to update
                    if (annotation.annotation_type.id in context.annotations) {
                        if (anno.deleted) {
                            context.synchronisationNotifications(className, annotation, "GlobalAnnotationDeleted")
                        }
                        else {
                            context.synchronisationNotifications(className, annotation, "GlobalAnnotationUpdated")
                        }
                    } else {
                        context.synchronisationNotifications(className, annotation, "GlobalAnnotationCreated")
                    }

                    // set annotation to values form Server
                    context.annotations[annotation.annotation_type.id] = annotation;
                    context.viewer.raiseEvent('sync_GlobalAnnotations', { annotation });
                }
            },
            error: function (request, status, error) {
                $.notify(`Server ERR_CONNECTION_REFUSED`, { position: "bottom center", className: "error" });
            }
        });
    }

    saveAnnotation(annotation) {

        var action = 'POST';
        var url = this.API_1_ANNOTATIONS_BASE_URL + "annotations/";

        var data = {
            deleted: annotation.deleted,
            annotation_type: annotation.annotation_type.id,
            image: annotation.image,
            vector: annotation.vector,
            unique_identifier: annotation.unique_identifier
        };

        // edit instead of create
        if (annotation.id !== -1) {

            action = 'PATCH';
            data.id = annotation.id;
            url = url + annotation.id + "/";
        }

        url = url + "?" + this.API_1_ANNOTATION_EXPAND + this.API_1_ANNOTATION_FIELDS;

        let context = this;
        $.ajax(url, {
            type: action, headers: this.gHeaders, dataType: 'json',
            data: JSON.stringify(data), success: function (anno, textStatus, jqXHR) {
                if (jqXHR.status === 200) {
                    if (anno.deleted === true) {
                        context.synchronisationNotifications("info", anno, "GlobalAnnotationUpdated")
                    } else {
                        context.synchronisationNotifications("info", anno, "GlobalAnnotationDeleted")
                    }

                } else if (jqXHR.status === 201) {
                    context.synchronisationNotifications("info", anno, "GlobalAnnotationCreated")
                }
                anno.annotation_type = context.annotationTypes[anno.annotation_type]
                context.annotations[anno.annotation_type.id] = anno

                context.viewer.raiseEvent('sync_UpdateStatisticsGlobal', {});
            },
            error: function () {
                $.notify(`Server ERR_CONNECTION_REFUSED`, { position: "bottom center", className: "error" });
            }
        });
    }

    getAnnotation(annotation_type_id) {
        return this.annotations[annotation_type_id]
    }

    changeGlobalAnnotation(annotation_type_id, active) {

        let annotation = this.getAnnotation(annotation_type_id);
        if (annotation === undefined) {
            annotation = {
                annotation_type: this.annotationTypes[annotation_type_id],
                id: -1,
                vector: null,
                user: { id: null, username: "you" },
                last_editor: { id: null, username: "you" },
                image: this.imageId,
                unique_identifier: this.getUUIDV4()
            }
        }

        if (active) {
            annotation.deleted = false;
        } else {
            // set global annotation as deleted
            annotation.deleted = true;
        }
        this.saveAnnotation(annotation)
    }

    synchronisationNotifications(className, anno, mode) {

        switch (mode) {
            case "GlobalAnnotationCreated":
                $.notify(`Global annotation ${anno.id} was created by ${anno.last_editor.username}`,
                    { position: "bottom center", className: className });
                break;
            case "GlobalAnnotationDeleted":
                $.notify(`Global annotation ${anno.id} was deleted by ${anno.last_editor.username}`,
                    { position: "bottom center", className: "info" });
                break;
            case "GlobalAnnotationUpdated":
                $.notify(`Global annotation ${anno.id} was updated by ${anno.last_editor.username}`,
                    { position: "bottom center", className: className });
                break;
        }
    }
}