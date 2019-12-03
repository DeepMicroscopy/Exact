(function($) {
    'use strict';

    if (!$.version || $.version.major < 2) {
        throw new Error('This version of OpenSeadragonSelection requires OpenSeadragon version 2.0.0+');
    }

    $.Viewer.prototype.selection = function(options) {
        if (!this.selectionInstance || options) {
            options = options || {};
            options.viewer = this;
            this.selectionInstance = new $.Selection(options);
        }
        return this.selectionInstance;
    };


    /**
    * @class Selection
    * @classdesc Provides functionality for selecting part of an image
    * @memberof OpenSeadragon
    * @param {Object} options
    */
    $.Selection = function ( options ) {

        $.extend( true, this, {
            // internal state properties
            viewer:                  null,
            isSelecting:             false,
            buttonActiveImg:         false,
            rectDone:                true,

            // options
            element:                 null,
            toggleButton:            null,
            showSelectionControl:    true,
            showConfirmDenyButtons:  true,
            styleConfirmDenyButtons: true,
            returnPixelCoordinates:  true,
            keyboardShortcut:        'c',
            rect:                    null,
            allowRotation:           true,
            startRotated:            false, // useful for rotated crops
            startRotatedHeight:      0.1,
            restrictToImage:         false,
            onSelection:             null,
            prefixUrl:               null,
            navImages:               {
                selection: {
                    REST:   'selection_rest.png',
                    GROUP:  'selection_grouphover.png',
                    HOVER:  'selection_hover.png',
                    DOWN:   'selection_pressed.png'
                },
                selectionConfirm: {
                    REST:   'selection_confirm_rest.png',
                    GROUP:  'selection_confirm_grouphover.png',
                    HOVER:  'selection_confirm_hover.png',
                    DOWN:   'selection_confirm_pressed.png'
                },
                selectionCancel: {
                    REST:   'selection_cancel_rest.png',
                    GROUP:  'selection_cancel_grouphover.png',
                    HOVER:  'selection_cancel_hover.png',
                    DOWN:   'selection_cancel_pressed.png'
                },
            },


        }, options );

        $.extend( true, this.navImages, this.viewer.navImages );

        if (!this.element) {
            this.element = $.makeNeutralElement('div');
            this.element.style.background = 'rgba(0, 0, 0, 0.1)';
            this.element.className        = 'selection-box';
        }
        this.borders = this.borders || [];
        var handle;

        //if (this.keyboardShortcut) {
        //    $.addEvent(
        //        this.viewer.container,
        //        'keypress',
        //        $.delegate(this, onKeyPress),
        //        false
        //    );
        //}


        this.selectionTracker = new $.MouseTracker({
            element:            this.viewer.canvas,
            clickTimeThreshold: this.viewer.clickTimeThreshold,
            clickDistThreshold: this.viewer.clickDistThreshold,
            dragHandler:        $.delegate( this, onDrag ),
            dragEndHandler:     $.delegate( this, onDragEnd ),
            pressHandler:       $.delegate( this, onPress ),
            scrollHandler:      $.delegate( this, onScroll ),
            startDisabled:      !this.isSelecting,
        });


        var prefix = this.prefixUrl || this.viewer.prefixUrl || '';
        var useGroup = this.viewer.buttons && this.viewer.buttons.buttons;
        var anyButton = useGroup ? this.viewer.buttons.buttons[0] : null;
        var onFocusHandler = anyButton ? anyButton.onFocus : null;
        var onBlurHandler = anyButton ? anyButton.onBlur : null;
        if (this.showSelectionControl) {
            this.toggleButton = new $.Button({
                element:    this.toggleButton ? $.getElement( this.toggleButton ) : null,
                clickTimeThreshold: this.viewer.clickTimeThreshold,
                clickDistThreshold: this.viewer.clickDistThreshold,
                tooltip:    $.getString('Tooltips.SelectionToggle') || 'Toggle selection (c)',
                srcRest:    prefix + this.navImages.selection.REST,
                srcGroup:   prefix + this.navImages.selection.GROUP,
                srcHover:   prefix + this.navImages.selection.HOVER,
                srcDown:    prefix + this.navImages.selection.DOWN,
                onRelease:  this.toggleState.bind( this ),
                onFocus:    onFocusHandler,
                onBlur:     onBlurHandler
            });
            if (useGroup) {
                this.viewer.buttons.buttons.push(this.toggleButton);
                this.viewer.buttons.element.appendChild(this.toggleButton.element);
            }
            if (this.toggleButton.imgDown) {
                this.buttonActiveImg = this.toggleButton.imgDown.cloneNode(true);
                this.toggleButton.element.appendChild(this.buttonActiveImg);
            }
        }

    };

    $.extend( $.Selection.prototype, $.ControlDock.prototype, /** @lends OpenSeadragon.Selection.prototype */{

        toggleState: function() {
            return this.setState(!this.isSelecting);
        },

        setState: function(enabled) {
            this.isSelecting = enabled;

            this.viewer.setMouseNavEnabled(!enabled);
            this.selectionTracker.setTracking(enabled);

            if (this.buttonActiveImg) {
                this.buttonActiveImg.style.visibility = enabled ? 'visible' : 'hidden';
            }

            this.viewer.raiseEvent('selection_toggle', {enabled: enabled});
            return this;
        },

    });

    function onKeyPress(e) {
        console.log(e);
        var key = e.keyCode ? e.keyCode : e.charCode;
        if (String.fromCharCode(key) === this.keyboardShortcut) {
            this.toggleState();
        }
    }

    function onDrag(e) {
        this.viewer.raiseEvent('selection_onDrag', e);
    }

    function onDragEnd(e) {
        this.viewer.raiseEvent('selection_onDragEnd', e);
    }

    function onPress(e) {
        this.viewer.raiseEvent('selection_onPress', e);
    }

    function onScroll(e) {
        this.viewer.raiseEvent('selection_onScroll', e);
    }

})(OpenSeadragon);
