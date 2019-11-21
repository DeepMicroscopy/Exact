(function() {
  var $ = window.OpenSeadragon

  if (!$) {
      $ = require('openseadragon')
      if (!$) {
          throw new Error('OpenSeadragon is missing.')
      }
  }
  // ----------
  $.Viewer.prototype.HTMLelements = function(options) {
    if (!this.elementsInstance || options) {
      options = options || {}
      options.viewer = this
      this.elementsInstance = new $.hElements(options)
    }
    return this.elementsInstance
  }

  $.hElements = function (options) {
    var self = this
    this.viewer = options.viewer

    // elements is an array of objects in the format:
    // {
    //   id: <string>,
    //   element: <HTMLelement>,
    //   rect: <OpenSeadragon.Rect> in imageCoordinates,
    //   (optional) fontSize: number
    // }
    this.elements = []

    for (h of ["open", "animation", "rotate", "flip", "resize"]) {
      this.viewer.addHandler(h, function() {repositionElements(self.elements, self.viewer)})
    }
  }
    // ----------
  $.hElements.prototype = {
    getElements: function() {
      return this.elements
    },
    getElementById: function(id) {
      return this.elements.find(function(e) {return e.id === id})
    },
    addElement: function(e) {
      if (validateElement(e)) {
        e.element.style.width = "100%"
        e.element.style.height = "100%"
        let wrapperDiv = document.createElement("div")
        wrapperDiv.style.position = "absolute"
        wrapperDiv.appendChild(e.element)
        this.viewer.canvas.appendChild(wrapperDiv)
        this.elements.push({
          ...e,
          element: wrapperDiv,
          rect: new OpenSeadragon.Rect(
            e.x + e.width / 2,
            e.y + e.height / 2,
            e.width,
            e.height
          )
        })
      }
      return this.elements
    },
    addElements: function(es) {
      for (let e of es) {
        this.addElement(e)
      }
      return this.elements
    },
    removeAllElements: function() {
      for (let el of this.elements) {
        this.viewer.canvas.removeChild(el.element);
      }
      this.elements.length = 0;
    },
    removeElementById: function(id) {
      const e = this.getElementById(id)
      if (e !== undefined) {
        this.viewer.canvas.removeChild(e.element)
        this.elements.splice(this.elements.indexOf(e), 1)
      }
      return this.elements
    },
    removeElementsById: function(ids) {
      for (let id of ids) {
        this.removeElementById(id)
      }
      return this.elements
    },
    goToElementLocation: function(id) {
      const e = this.getElementById(id)
      if (e !== null) {
      const vpRect = this.viewer.viewport.imageToViewportRectangle(e.rect)
      const vpPos = viewer.viewport.imageToViewportCoordinates(e.rect.x, e.rect.y)
        this.viewer.viewport.fitBoundsWithConstraints(new OpenSeadragon.Rect(
          vpPos.x - vpRect.width / 2,
          vpPos.y - vpRect.height / 2,
          vpRect.width,
          vpRect.height
        ))
      }
    }
  }
})()

// ----------
// Helper functions. Not on proptotype

function validateElement(e) {
  const props = ["id", "element", "x", "y", "width", "height"]
  let isValid = true
  let errors = []
  for (prop of props) {
    if (!(prop in e)) {
      isValid = false
      errors.push(prop)
    }
  }
  if (errors.length !== 0) {
    console.log("Missing properties " + errors.join(", ") + ". Element was not added: ", e)
  }
  return isValid
}

function repositionElements(es, viewer) {
  for (let e of es) {
    repositionElement(e, viewer)
  }
}

function repositionElement(e, viewer) {
  const newRect = viewer.viewport.viewportToViewerElementRectangle(
    viewer.viewport.imageToViewportRectangle(e.rect)
  )
  const point = viewer.viewport.getFlip() ?
    flipPoint({x: e.rect.x, y: e.rect.y}, viewer.viewport.getRotation(), viewer.world.getItemAt(0).viewportToImageCoordinates(viewer.viewport.getCenter(true)))
    : {x: e.rect.x, y: e.rect.y}
  const pos = viewer.viewport.viewportToViewerElementCoordinates(
    viewer.viewport.imageToViewportCoordinates(point.x, point.y)
  )
  e.element.style.left = pos.x - newRect.width / 2 + "px"
  e.element.style.top = pos.y - newRect.height / 2 + "px"
  e.element.style.width = newRect.width + "px"
  e.element.style.height = newRect.height + "px"
  if ("fontSize" in e) {
    e.element.style.fontSize = (
      e.fontSize * viewer.viewport.getZoom(true) / viewer.viewport.getHomeZoom()
    ) + "px"
  }
}


function flipPoint(p, angle, center) {
  const rotatedPoint = rotatePoint(p, 180 + angle * 2, center)
  return {x: rotatedPoint.x, y: center.y * 2 - rotatedPoint.y}
}

function rotatePoint(p, angle, center) {
  angle = angle * Math.PI / 180
  let point = center ? subtractPoints(p, center) : p,
      sin = Math.sin(angle),
      cos = Math.cos(angle)
  point = {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  }
  return center ? addPoints(point, center) : point
}

function subtractPoints(p1, p2) {
  return {x: p1.x - p2.x, y: p1.y - p2.y}
}

function addPoints(p1, p2) {
  return {x: p1.x + p2.x, y: p1.y + p2.y}
}
