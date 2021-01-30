

class SearchTool {
    constructor(image_id, viewer, exact_sync) {
        this.image_id = image_id;
        this.viewer = viewer;
        this.exact_sync = exact_sync;
        this.currentAnnotation = null;
        this.all_annotations = [];
        this.search_offset = 2

        this.searchFields = ['@id', '@label', '@first editor', '@last editor', '@remark'];

        this.initUiEvents();
    }

    initUiEvents() {

        $('#search_update_btn').click(this.updateSearch.bind(this))

        $('#back_button_search').click(this.backOneSearchElement.bind(this)); 
        $('#next_button_search').click(this.nextOneSearchElement.bind(this)); 

        $('#currentSearchElement').keypress(this.setCurrentAnnotationByKey.bind(this));
    }

    setCurrentAnnotationByKey(event) {
        var keycode = (event.keyCode ? event.keyCode : event.which);
        if(keycode == '13'){
            
            let serach_id = $('#currentSearchElement').val().trim();

            let currentAnnotation = this.all_annotations.find(a => a.id === parseInt(serach_id));
            if (currentAnnotation !== undefined) {
                this.currentAnnotation = currentAnnotation;

                let annotation = this.currentAnnotation;
                this.viewer.raiseEvent('search_ShowAnnotation', { annotation });
            } else {
                $("#currentSearchElement").notify("Id not found", { position: "bottom center", className: "error" });
            }

        }
    }

    backOneSearchElement(event) {

        let currentIndex = this.all_annotations.indexOf(this.currentAnnotation)

        if (currentIndex -1 > 0) {
            currentIndex -= 1;
            this.updateTable(this.all_annotations, Math.max(currentIndex-this.search_offset, 0), currentIndex + this.search_offset)

            this.currentAnnotation = this.all_annotations[currentIndex];

            $("#currentSearchElement").val(this.currentAnnotation.id);

            let annotation = this.currentAnnotation;
            this.viewer.raiseEvent('search_ShowAnnotation', { annotation });
        }
    }

    nextOneSearchElement(event) {

        let currentIndex = this.all_annotations.indexOf(this.currentAnnotation)

        if (currentIndex +1 < this.all_annotations.length) {

            currentIndex += 1;
            this.updateTable(this.all_annotations, Math.max(currentIndex-2, 0), currentIndex+2)

            this.currentAnnotation = this.all_annotations[currentIndex];

            $("#currentSearchElement").val(this.currentAnnotation.id);

            let annotation = this.currentAnnotation;
            this.viewer.raiseEvent('search_ShowAnnotation', { annotation });
        }
    }

    raiseSearchedAnnotationClicked(event) {

        let unique_identifier = event.currentTarget.dataset.unique_identifier;
        this.currentAnnotation = this.exact_sync.annotations[unique_identifier];

        $("#currentSearchElement").val(this.currentAnnotation.id);

        let annotation = this.currentAnnotation;
        this.viewer.raiseEvent('search_ShowAnnotation', { annotation });
    }

    updateSearch(searchText) {

        if (searchText.hasOwnProperty('originalEvent'))
            searchText.preventDefault();

        if (searchText === undefined || searchText.hasOwnProperty('originalEvent')) {
            searchText = $('#searchInputAnnotation').val().trim().toLowerCase();
        }

        $("#currentSearchElement").val("");

        // save found annotations
        var all_annotations = Object.values(this.exact_sync.annotations)

        if (searchText) {

            if (this.searchFields.some(searchField => searchText.includes(searchField))) {

                let search_requests = searchText.split(';');

                search_requests.forEach(function (item, index) {
                    if (item.includes(':')) {

                        var field = item.split(':')[0];
                        var value = item.split(':')[1];

                        switch (field) {
                            case "@id":
                                if (!isNaN(parseInt(value)))
                                    value = parseInt(value);

                                all_annotations = all_annotations.filter(function (item) {
                                    return item.id === value;
                                });
                                break;

                            case "@label":
                                all_annotations = all_annotations.filter(function (item) {
                                    return item.annotation_type.name.toLowerCase() === value;
                                });
                                break;

                            case "@first editor":
                                all_annotations = all_annotations.filter(function (item) {
                                    return item.user.toLowerCase() === value;
                                });
                                break;

                            case "@last editor":
                                all_annotations = all_annotations.filter(function (item) {
                                    return item.last_editor.toLowerCase() === value;
                                });
                                break;

                            case "@verified":
                                all_annotations = all_annotations.filter(function (item) {
                                    item.is_verified.toString() === value;
                                });
                                break;

                            case "@verified":
                                all_annotations = all_annotations.filter(function (item) {
                                    return item.remark.toLowerCase().includes(value);
                                });
                                break;

                            default:
                                break;
                        }
                    }
                }); 
            }
        }

        this.all_annotations = all_annotations

        this.updateTable(this.all_annotations)

        return all_annotations;
    }

    updateTable(all_annotations, start=0, end=10) {

        var table = document.getElementById('annotationSearchResults');

        // remove all elements from table expect first
        while (table.childNodes.length > 3) {
            table.removeChild(table.lastChild);
        }


        for (const item of all_annotations.slice(start, end)) {
            var row = document.createElement("tr");

            // ID
            var column = document.createElement("th");
            var id_link = document.createElement("a");
            id_link.textContent = item.id;
            id_link.setAttribute("data-unique_identifier", item.unique_identifier);
            id_link.onclick = this.raiseSearchedAnnotationClicked.bind(this);
            column.appendChild(id_link);
            row.appendChild(column);

            // Label
            column = document.createElement("th");
            var label = document.createElement("label");
            label.innerText = item.annotation_type.name;
            column.appendChild(label);
            row.appendChild(column);

            // First Editor
            var column = document.createElement("th");
            var name_link = document.createElement("a");
            name_link.setAttribute('href', include_server_subdir(`/users/user/${item.user.id}/`));
            name_link.textContent = item.user.username;
            column.appendChild(name_link);
            row.appendChild(column);

            // First Editor
            var column = document.createElement("th");
            name_link = document.createElement("a");
            name_link.setAttribute('href', include_server_subdir(`/users/user/${item.last_editor.id}/`));
            name_link.textContent = item.last_editor.username;
            column.appendChild(name_link);
            row.appendChild(column);

            // verified
            column = document.createElement("th");
            var verified = document.createElement("label");
            verified.innerText = item.verified_by_user.toString();
            column.appendChild(verified);
            row.appendChild(column);

            // remark
            column = document.createElement("th");
            var remark = document.createElement("label");
            remark.innerText = item.remark;
            column.appendChild(remark);
            row.appendChild(column);

            table.appendChild(row);
        }
    }

    destroy() {
        $('#search_update_btn').off("click");
    }

}