# Plugin System

Plugins connect external algorithms (deep learning models, analysis tools) to EXACT. A plugin runs as a separate process or service and communicates with EXACT through the REST API.

## How plugins work

```
EXACT server  ←──REST API──→  Plugin process
     │                              │
  PluginJob                    reads images,
  (queued)                     writes annotations
```

1. A user (or schedule) triggers a plugin job from the imageset view or via the API.
2. EXACT creates a `PluginJob` record with the target imageset and parameters.
3. The plugin process polls for pending jobs, processes images, and writes results back as annotations via the REST API.
4. EXACT displays the results in the annotator.

## Plugin registration

Plugins are registered under **Administration → Plugins**. Each plugin record stores:

| Field | Meaning |
|---|---|
| Name | Display name |
| Script | Path to the plugin entry point |
| Products | Which annotation types the plugin produces |
| Queue | Which job queue to use (default: `celery`) |

## Writing a plugin

The easiest way to write a plugin is with [EXACT-Sync](https://github.com/DeepMicroscopy/EXACT-Sync):

```bash
pip install EXACT-Sync
```

```python
from exact_sync.v1.api import annotations_api, images_api
from exact_sync.v1.configuration import Configuration
from exact_sync.v1 import ApiClient

config = Configuration(host="http://localhost:8000")
config.username = "exact"
config.password = "exact"

with ApiClient(config) as client:
    img_api = images_api.ImagesApi(client)
    ann_api = annotations_api.AnnotationsApi(client)

    # Fetch images from an imageset
    images = img_api.images_images_list(image_set=42)

    for image in images.results:
        # Run your model
        boxes = my_model.predict(image.id)

        # Write annotations back
        for x1, y1, x2, y2, label in boxes:
            ann_api.annotations_annotations_create(body={
                "annotation_type": label_to_type_id[label],
                "image": image.id,
                "vector": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            })
```

See the [Inference notebook](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/blob/master/doc/Inference%20Asthma.ipynb) for a complete end-to-end example with a real model.

## Example notebooks

| Notebook | Topic |
|---|---|
| [Inference Asthma](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/blob/master/doc/Inference%20Asthma.ipynb) | Run a trained model and upload results |
| [Segmentation](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/blob/master/doc/Segmentation.ipynb) | Polygon segmentation results |
| [AnnotationMap](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/blob/master/doc/AnnotationMap.ipynb) | Heatmap / density overlay |
| [ClusterCells](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/blob/master/doc/ClusterCells.ipynb) | Cluster existing annotations |
| [PatchClassifier](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/blob/master/doc/PatchClassifier.ipynb) | Tile-level classification |

All notebooks are also available via [NBViewer](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/tree/master/doc/).
