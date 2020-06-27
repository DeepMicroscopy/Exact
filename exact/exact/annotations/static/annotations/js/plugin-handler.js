
class PluginHandler {
    constructor(imageId, gHeaders, viewer) {

        this.imageId = imageId;
        this.gHeaders = gHeaders;
        this.viewer = viewer;

        this.API_IMAGES_BASE_URL = '/images/api/';

        this.initViewerEventHandler(viewer);
    }

    initViewerEventHandler(viewer) {

        viewer.addHandler('animation-finish', function (event) {
            this.userData.updatePlugins();
        }, this);
    }

    updatePlugins() {

        var bounds = this.viewer.viewport.getBounds(true);
        var imageRect = this.viewer.viewport.viewportToImageRectangle(bounds);

        let data = {
            image_id: this.imageId,
            options: {
                min_x: Math.round(imageRect.x),
                min_y: Math.round(imageRect.y),
                max_x: Math.round(imageRect.x + imageRect.width),
                max_y: Math.round(imageRect.y + imageRect.height)
            }
        };


        if (globals.screeningTool !== undefined && globals.screeningTool.getImageId() === imageId) {
            data.options['current_index'] = globals.screeningTool.getCurrentIndx();
        }
        
        // update Plugins
        $.ajax(this.API_IMAGES_BASE_URL + 'image/plugins/', {
            type: 'GET',
            headers: this.gHeaders,
            dataType: 'json',
            data: { 'values': JSON.stringify(data) },
            success: function (data) {
                var el = document.getElementById('statistics_tabs');
                if (el) {
                    for (let plugin of data.plugins) {
                        var tab_name = plugin.id;

                        if (document.getElementById(tab_name + "_tab") === null) {

                            var node = document.createElement("li");
                            node.setAttribute('class', 'nav-item');
                            node.setAttribute('style', "float: none");

                            var tab_name = plugin.id;
                            var link = document.createElement("a");
                            link.setAttribute('class', 'nav-link');
                            link.setAttribute('id', tab_name + "_tab");
                            link.setAttribute('data-toggle', 'tab');
                            link.setAttribute('href', '#' + tab_name);

                            link.textContent = tab_name;

                            node.appendChild(link);
                            el.appendChild(node);
                        }
                    }
                }

                var el_content = document.getElementById('statistics_tabs_content');

                if (el_content) {
                    for (let plugin of data.plugins) {
                        var tab_name = plugin.id;

                        var node = document.getElementById(tab_name);
                        if (node === null) {
                            var node = document.createElement("div");
                            node.setAttribute('class', 'tab-pane fade');
                            node.setAttribute('id', tab_name);

                            node.innerHTML = plugin.content;
                            el_content.appendChild(node);
                        } else {
                            node.innerHTML = plugin.content;
                        }
                    }
                }
            },
            error: function () {
            }
        });
    }
}