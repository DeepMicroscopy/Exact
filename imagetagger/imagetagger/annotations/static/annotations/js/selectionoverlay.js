(function( $ ){
    'use strict';

    /**
     * @class Overlay
     * @classdesc Provides a way to float an HTML element on top of the viewer element.
     *
     * @memberof OpenSeadragon
     * @param {Object} options
     * @param {Element} options.element
     * @param {OpenSeadragon.Point|OpenSeadragon.Rect|OpenSeadragon.SelectionRect} options.location - The
     * location of the overlay on the image. If a {@link OpenSeadragon.Point}
     * is specified, the overlay will keep a constant size independently of the
     * zoom. If a {@link OpenSeadragon.Rect} is specified, the overlay size will
     * be adjusted when the zoom changes.
     * @param {OpenSeadragon.OverlayPlacement} [options.placement=OpenSeadragon.OverlayPlacement.TOP_LEFT]
     * Relative position to the viewport.
     * Only used if location is a {@link OpenSeadragon.Point}.
     * @param {OpenSeadragon.Overlay.OnDrawCallback} [options.onDraw]
     * @param {Boolean} [options.checkResize=true] Set to false to avoid to
     * check the size of the overlay everytime it is drawn when using a
     * {@link OpenSeadragon.Point} as options.location. It will improve
     * performances but will cause a misalignment if the overlay size changes.
     */
    $.SelectionOverlay = function( element, location) {
        $.Overlay.apply( this, arguments );

        // set the rotation in radians
        if ( $.isPlainObject( element ) ) {
            this.rotation = element.location.rotation || 0;
        } else {
            this.rotation = location.rotation || 0;
        }
    };

    $.SelectionOverlay.prototype = $.extend( Object.create($.Overlay.prototype), {

        /**
         * @function
         * @param {Element} container
         */
        drawHTML: function() {
            $.Overlay.prototype.drawHTML.apply( this, arguments );
            this.style.transform = this.style.transform.replace(/ ?rotate\(.+rad\)/, '') +
                ' rotate(' + this.rotation + 'rad)';
        },

        /**
         * @function
         * @param {OpenSeadragon.Point|OpenSeadragon.Rect} location
         * @param {OpenSeadragon.OverlayPlacement} position
         */
        update: function( location ) {
            $.Overlay.prototype.update.apply( this, arguments );
            this.rotation = location.rotation || 0;
        }
    });

}( OpenSeadragon ));
