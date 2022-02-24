/*
* heatmap.js openseadragon overlay (added by BDN - 08/11/21)
*
* Dual-licensed under the MIT (http://www.opensource.org/licenses/mit-license.php)
* and the Beerware (http://en.wikipedia.org/wiki/Beerware) license.
*/

function HeatmapOverlay(viewer, cfg) {
    var self = this;
    this._viewer = viewer;
    this.initialize(cfg || {});


    this._viewer.addHandler('open', function () {
        self.resize();
    });

    this._viewer.addHandler('full-screen', function () {
        self.resize();
    });

    this._viewer.addHandler('resize', function () {
        self.resize();
    });
};

HeatmapOverlay.CSS_TRANSFORM = (function () {
    var div = document.createElement('div');
    var props = [
        'transform',
        'WebkitTransform',
        'MozTransform',
        'OTransform',
        'msTransform'
    ];

    for (var i = 0; i < props.length; i++) {
        var prop = props[i];
        if (div.style[prop] !== undefined) {
            return prop;
        }
    }
    return props[0];
})();

HeatmapOverlay.prototype.initialize = function (cfg) {
    this.cfg = cfg;

    //var map = this.map = this.getMap();
    var hmDIV = document.getElementById("hmDIV")
    var hmDIV = (hmDIV === null) ? document.createElement('div') : hmDIV;
    hmDIV.id = 'hmDIV';
    var container = this.container = hmDIV;
    var width = this.width = this._viewer.container.clientWidth;
    var height = this.height = this._viewer.container.clientHeight;

    container.style.cssText = 'width:' + width + 'px;height:' + height + 'px;';

    this.data = [];
    this.max = 1;

    cfg.container = container;

    this.onAdd();
};

HeatmapOverlay.prototype.setData = function (data) {
    this.max = data.max;

    // transform data to latlngs
    var data = data.data;
    var len = data.length;
    var d = [];

    while (len--) {
        var entry = data[len];
        var dataObj = {};
        dataObj.value = entry.value;
        dataObj.x = entry.x;
        dataObj.y = entry.y;
        if (entry.radius) {
            dataObj.radius = entry.radius;
        }
        d.push(dataObj);
    }
    this.data = d;
    //this.data = this.data.concat(d);
    this.update();
};

HeatmapOverlay.prototype.resize = function () {

    // if (!this.map){ return; }

    var container = this.container;

    if (width == this.width && height == this.height) { return; }

    var width = this._viewer.container.clientWidth;
    var height = this._viewer.container.clientHeight;

    container.style.cssText = 'width:' + width + 'px;height:' + height + 'px;';

    this.width = width;
    this.height = height;

    // update heatmap dimensions
    this.heatmap._renderer.setDimensions(width, height);
    // then redraw all datapoints with update
    this.update();
};

HeatmapOverlay.prototype.update = function () {
    var zoom = this._viewer.viewport.getZoom(true);
    // console.log('viewport.getZoom=', zoom)


    var imagingHelper = this._viewer.activateImagingHelper({
        worldIndex: 0,
        // onImageViewChanged: onImageViewChanged
    });
    var zoomfact = imagingHelper.getZoomFactor();
    // console.log('zoomfact=', zoomfact)

    var generatedData = { max: this.max };
    var points = [];
    // iterate through data 
    // deactivate heatmap at a certain zoom level
    var len = (zoom > this.cfg.zoom_threshold) ? 0 : this.data.length;
    var localMax = 0;
    var valueField = this.cfg.valueField;


    while (len--) {
        var entry = this.data[len];
        var value = entry.value;
        // console.log('Radius/zoom=', entry.radius / zoom)
        // console.log('Radius/zoomfact=', entry.radius / zoomfact)

        if (value > localMax) {
            localMax = value;
        }

        // console.log('entry.x=', entry.x)

        var viewportPoint = this._viewer.viewport.imageToViewportCoordinates(entry.x, entry.y);
        // console.log('imgeToViewportCoord=', viewportPoint);
        var imagePoint = this._viewer.viewport.pixelFromPoint(viewportPoint, true);
        // console.log('imagePoint=', imagePoint);

        //ignore outter point
        if (imagePoint.x <= 0 || imagePoint.y <= 0 || imagePoint.x >= this._viewer.viewport.getContainerSize().x || imagePoint.y >= this._viewer.viewport.getContainerSize().y)
            continue;

        var point = { x: Math.round(imagePoint.x), y: Math.round(imagePoint.y), value: value };

        var radius;

        // TODO: Fix the jumping heatmap area
        if (entry.radius) {
            radius = 10 / zoom;
            if (zoom > 13) {
                radius = entry.radius;
            } else {
                radius = 20;
            }
        } else {
            radius = (this.cfg.radius || 20) * zoom;
        }
        point.radius = radius;

        var intensity;
        if (entry.value) {
            intensity = entry.value * zoom;
        } else {
            intensity = 10;
        }
        point.value = intensity;
        point.radius = radius;

        points.push(point);
    }
    if (this.cfg.useLocalExtrema) {
        generatedData.max = localMax;
    }

    generatedData.data = points;

    this.heatmap.setData(generatedData);

};

HeatmapOverlay.prototype.onAdd = function () {

    this._viewer.canvas.appendChild(this.container);

    this.changeHandler = this._viewer.addHandler('update-viewport', function (arg) {
        arg.userData.draw.call(arg.userData);
    }, this);


    if (!this.heatmap) {
        this.heatmap = h337.create(this.cfg);
    }
    this.draw();
};

HeatmapOverlay.prototype.draw = function () {
    if (!this._viewer) { return; }

    this.update();
};