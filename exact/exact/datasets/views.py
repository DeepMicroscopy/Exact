import os
import gdown
import pandas as pd
import hashlib
import json
import zipfile
from pathlib import Path
from django.shortcuts import render
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.shortcuts import get_object_or_404
from django.db import transaction

from exact.users.models import User, Team
from exact.administration.models import Product
from exact.annotations.models import Annotation, AnnotationType
from exact.datasets.forms import DatasetForm, MITOS_WSI_CMCDatasetForm
from exact.images.models import ImageSet, Image
from exact.images.views import view_imageset


download_path = Path("exact/exact/datasets/downloads/")

# Create your views here.
def index(request):

    # If this is a GET (or any other method) create the default form.
    #asthma_form = DatasetForm(user=request.user)
    #eiph_form = DatasetForm(user=request.user)

    asthma_miccai_form = DatasetForm(user=request.user)
    eiph_miccai_form = DatasetForm(user=request.user)
    mitotic_miccai_form = DatasetForm(user=request.user)
    mitos_wsi_cmc_form = MITOS_WSI_CMCDatasetForm(user=request.user)

    context = {
        'asthma_miccai_form': asthma_miccai_form,
        'eiph_miccai_form': eiph_miccai_form,
        'mitotic_miccai_form': mitotic_miccai_form,
        'mitos_wsi_cmc_form': mitos_wsi_cmc_form

        #'asthma_form': asthma_form,
        #'eiph_form': eiph_form,
    }

    return TemplateResponse(request, 'index.html', context)


def create_mitos_wsi_cmc_dataset(request):

    # If this is a POST request then process the Form data
    if request.method == 'POST':
        
        # Create a form instance and populate it with data from the request (binding):
        form = MITOS_WSI_CMCDatasetForm(request.POST)

        # Check if the form is valid:
        if form.is_valid():
            errors = []
            team = get_object_or_404(Team, id=form.data['team'])
            image_set_name = form.data["name"]
            product_name = form.data["name"]+" Product"

            # create imageset, product and annotation type etc.
            with transaction.atomic():
                labels = {'mitotic figure':None}

                # create or load product
                product = Product.objects.filter(name=product_name,team=team).first()
                if product is None:
                    product = Product.objects.create(
                        name=product_name,
                        team=team,
                        creator=request.user
                    )

                # create or load AnnotationType
                for label, code in zip(labels.keys(), ["#0000FF"]):
                    anno_type = AnnotationType.objects.filter(name=label,product=product).first()
                    if anno_type is None:
                        anno_type = AnnotationType.objects.create(
                            name=label,
                            vector_type=1,
                            product=product,
                            color_code=code
                        )

                    labels[label] = anno_type

                #create imageset 
                image_set = ImageSet.objects.filter(name=image_set_name,team=team).first()
                if image_set is None:
                    image_set = ImageSet.objects.create(
                        team = team,
                        creator = request.user,
                        name = image_set_name,
                    )
                    image_set.product_set.add(product)
                    image_set.create_folder()
                    image_set.save()

                #create images

                url = 'https://drive.google.com/uc?id=1IZ_BdFB19iMM9RvX-uoHfnSsBG9Dj0Tn'

                zip_path = Path(image_set.root_path()) / "Mitosen.zip"
                gdown.download(url, str(zip_path), quiet=True, proxy=form.data["proxy"])

                # unpack zip-file
                zip_ref = zipfile.ZipFile(str(zip_path), 'r')
                zip_ref.extractall(image_set.root_path())
                zip_ref.close()
                # delete zip-file
                os.remove(str(zip_path))

                filenames =  [Path(image_set.root_path())/f.filename for f in zip_ref.filelist if ".txt" not in f.filename]
                annotations_path = Path(image_set.root_path()) / "ground truth.txt"

                annotations = pd.read_csv(annotations_path, delimiter="|",names=["file","class","vector","1","2","3","4","5","6","7","8"])

                for file_path in filenames:
                    image = Image.objects.filter(filename=file_path.name,image_set=image_set).first()
                    if image is None:
                        try:
                            # creates a checksum for image
                            fchecksum = hashlib.sha512()
                            with open(file_path, 'rb') as fil:
                                buf = fil.read(10000)
                                fchecksum.update(buf)
                            fchecksum = fchecksum.digest()

                            image = Image(
                                name=file_path.name,
                                image_set=image_set,
                                checksum=fchecksum)

                            image.save_file(file_path)

                            image_annotations = annotations[annotations["file"] == file_path.name]

                            # save annotations for image
                            for label, vector in zip(image_annotations["class"], image_annotations["vector"]):

                                if label in labels:
                                    vector = json.loads(vector)
                                    vector["x1"], vector["x2"], vector["y1"], vector["y2"] = int(vector["x1"]), int(vector["x2"]), int(vector["y1"]), int(vector["y2"])
                                    annotation_type = labels[label]
                                    anno = Annotation.objects.create(
                                        annotation_type = annotation_type,
                                        user = request.user,
                                        image = image,
                                        vector = vector 
                                    )


                        except Exception as e:
                            errors.append(e.message)

            # view image set
            return view_imageset(request, image_set.id)

    # If this is a GET (or any other method) create the default form.
    form = MITOS_WSI_CMCDatasetForm(user=request.user)

    context = {
        'mitos_wsi_cmc_form': form,
    }

    return TemplateResponse(request, 'mitos_wsi_cmc_form.html', context)


def create_miccai_mitotic_dataset(request):

    # If this is a POST request then process the Form data
    if request.method == 'POST':
        
        # Create a form instance and populate it with data from the request (binding):
        form = DatasetForm(request.POST)

        # Check if the form is valid:
        if form.is_valid():
            errors = []
            team = get_object_or_404(Team, id=form.data['team'])
            image_set_name = form.data["name"]
            product_name = form.data["name"]+" Product"

            # create imageset, product and annotation type etc.
            with transaction.atomic():
                labels = {'mitotic figure':None}

                # create or load product
                product = Product.objects.filter(name=product_name,team=team).first()
                if product is None:
                    product = Product.objects.create(
                        name=product_name,
                        team=team,
                        creator=request.user
                    )

                # create or load AnnotationType
                for label, code in zip(labels.keys(), ["#0000FF"]):
                    anno_type = AnnotationType.objects.filter(name=label,product=product).first()
                    if anno_type is None:
                        anno_type = AnnotationType.objects.create(
                            name=label,
                            vector_type=1,
                            product=product,
                            color_code=code
                        )

                    labels[label] = anno_type

                #create imageset 
                image_set = ImageSet.objects.filter(name=image_set_name,team=team).first()
                if image_set is None:
                    image_set = ImageSet.objects.create(
                        team = team,
                        creator = request.user,
                        name = image_set_name,
                    )
                    image_set.product_set.add(product)
                    image_set.create_folder()
                    image_set.save()

                #create images

                url = 'https://drive.google.com/uc?id=1IZ_BdFB19iMM9RvX-uoHfnSsBG9Dj0Tn'

                zip_path = Path(image_set.root_path()) / "Mitosen.zip"
                gdown.download(url, str(zip_path), quiet=True, proxy=form.data["proxy"])

                # unpack zip-file
                zip_ref = zipfile.ZipFile(str(zip_path), 'r')
                zip_ref.extractall(image_set.root_path())
                zip_ref.close()
                # delete zip-file
                os.remove(str(zip_path))

                filenames =  [Path(image_set.root_path())/f.filename for f in zip_ref.filelist if ".txt" not in f.filename]
                annotations_path = Path(image_set.root_path()) / "ground truth.txt"

                annotations = pd.read_csv(annotations_path, delimiter="|",names=["file","class","vector","1","2","3","4","5","6","7","8"])

                for file_path in filenames:
                    image = Image.objects.filter(filename=file_path.name,image_set=image_set).first()
                    if image is None:
                        try:
                            # creates a checksum for image
                            fchecksum = hashlib.sha512()
                            with open(file_path, 'rb') as fil:
                                buf = fil.read(10000)
                                fchecksum.update(buf)
                            fchecksum = fchecksum.digest()

                            image = Image(
                                name=file_path.name,
                                image_set=image_set,
                                checksum=fchecksum)

                            image.save_file(file_path)

                            image_annotations = annotations[annotations["file"] == file_path.name]

                            # save annotations for image
                            for label, vector in zip(image_annotations["class"], image_annotations["vector"]):

                                if label in labels:
                                    vector = json.loads(vector)
                                    vector["x1"], vector["x2"], vector["y1"], vector["y2"] = int(vector["x1"]), int(vector["x2"]), int(vector["y1"]), int(vector["y2"])
                                    annotation_type = labels[label]
                                    anno = Annotation.objects.create(
                                        annotation_type = annotation_type,
                                        user = request.user,
                                        image = image,
                                        vector = vector 
                                    )


                        except Exception as e:
                            errors.append(e.message)

            # view image set
            return view_imageset(request, image_set.id)

    # If this is a GET (or any other method) create the default form.
    form = DatasetForm(user=request.user)

    context = {
        'mitotic_miccai_form': form,
    }

    return TemplateResponse(request, 'mitotic_miccai_form.html', context)


def create_miccai_asthma_dataset(request):

    # If this is a POST request then process the Form data
    if request.method == 'POST':
        
        # Create a form instance and populate it with data from the request (binding):
        form = DatasetForm(request.POST)

        # Check if the form is valid:
        if form.is_valid():
            errors = []
            team = get_object_or_404(Team, id=form.data['team'])
            image_set_name = form.data["name"]
            product_name = form.data["name"]+" Product"

            # create imageset, product and annotation type etc.
            with transaction.atomic():
                labels = {'Mastzellen':None, "Makrophagen":None, "Neutrophile":None, "Eosinophile":None, "Lymohozyten":None}

                # create or load product
                product = Product.objects.filter(name=product_name,team=team).first()
                if product is None:
                    product = Product.objects.create(
                        name=product_name,
                        team=team,
                        creator=request.user
                    )

                # create or load AnnotationType
                for label, code in zip(labels.keys(), ["#0000FF", "#FF00FF", "#FF0000", "#808000", "#FFFF00"]):
                    anno_type = AnnotationType.objects.filter(name=label,product=product).first()
                    if anno_type is None:
                        anno_type = AnnotationType.objects.create(
                            name=label,
                            vector_type=1,
                            product=product,
                            color_code=code
                        )

                    labels[label] = anno_type

                #create imageset 
                image_set = ImageSet.objects.filter(name=image_set_name,team=team).first()
                if image_set is None:
                    image_set = ImageSet.objects.create(
                        team = team,
                        creator = request.user,
                        name = image_set_name,
                    )
                    image_set.product_set.add(product)
                    image_set.create_folder()
                    image_set.save()

                #create images

                url = 'https://drive.google.com/uc?id=1D0D9L3cXNI3I20wC62SjGdWys0LBYVfK'

                zip_path = Path(image_set.root_path()) / "Asthma.zip"
                gdown.download(url, str(zip_path), quiet=True, proxy=form.data["proxy"])

                # unpack zip-file
                zip_ref = zipfile.ZipFile(str(zip_path), 'r')
                zip_ref.extractall(image_set.root_path())
                zip_ref.close()
                # delete zip-file
                os.remove(str(zip_path))

                filenames =  [Path(image_set.root_path())/f.filename for f in zip_ref.filelist if ".txt" not in f.filename]
                annotations_path = Path(image_set.root_path()) / "ground truth.txt"

                annotations = pd.read_csv(annotations_path, delimiter="|",names=["file","class","vector","1","2","3","4","5","6","7","8"])

                for file_path in filenames:
                    image = Image.objects.filter(filename=file_path.name,image_set=image_set).first()
                    if image is None:
                        try:
                            # creates a checksum for image
                            fchecksum = hashlib.sha512()
                            with open(file_path, 'rb') as fil:
                                buf = fil.read(10000)
                                fchecksum.update(buf)
                            fchecksum = fchecksum.digest()

                            image = Image(
                                name=file_path.name,
                                image_set=image_set,
                                checksum=fchecksum)

                            image.save_file(file_path)

                            image_annotations = annotations[annotations["file"] == file_path.name]

                            # save annotations for image
                            for label, vector in zip(image_annotations["class"], image_annotations["vector"]):

                                if label in labels:
                                    vector = json.loads(vector)
                                    vector["x1"], vector["x2"], vector["y1"], vector["y2"] = int(vector["x1"]), int(vector["x2"]), int(vector["y1"]), int(vector["y2"])
                                    annotation_type = labels[label]
                                    anno = Annotation.objects.create(
                                        annotation_type = annotation_type,
                                        user = request.user,
                                        image = image,
                                        vector = vector 
                                    )


                        except Exception as e:
                            errors.append(e.message)

            # view image set
            return view_imageset(request, image_set.id)


    # If this is a GET (or any other method) create the default form.
    form = DatasetForm(user=request.user)

    context = {
        'asthma_miccai_form': form,
    }

    return TemplateResponse(request, 'dataset_asthma_miccai.html', context)


def create_miccai_eiph_dataset(request):

    # If this is a POST request then process the Form data
    if request.method == 'POST':
        
        # Create a form instance and populate it with data from the request (binding):
        form = DatasetForm(request.POST)

        # Check if the form is valid:
        if form.is_valid():
            errors = []
            team = get_object_or_404(Team, id=form.data['team'])
            image_set_name = form.data["name"]
            product_name = form.data["name"]+" Product"

            # create imageset, product and annotation type etc.
            with transaction.atomic():
                labels = {'0':None, "1":None, "2":None, "3":None, "4":None}

                # create or load product
                product = Product.objects.filter(name=product_name,team=team).first()
                if product is None:
                    product = Product.objects.create(
                        name=product_name,
                        team=team,
                        creator=request.user
                    )

                # create or load AnnotationType
                for label, code in zip(labels.keys(), ["#0000FF", "#FF00FF", "#FF0000", "#808000", "#FFFF00"]):
                    anno_type = AnnotationType.objects.filter(name=label,product=product).first()
                    if anno_type is None:
                        anno_type = AnnotationType.objects.create(
                            name=label,
                            vector_type=1,
                            product=product,
                            color_code=code
                        )

                    labels[label] = anno_type

                #create imageset 
                image_set = ImageSet.objects.filter(name=image_set_name,team=team).first()
                if image_set is None:
                    image_set = ImageSet.objects.create(
                        team = team,
                        creator = request.user,
                        name = image_set_name,
                    )
                    image_set.product_set.add(product)
                    image_set.create_folder()
                    image_set.save()

                #create images

                url = 'https://drive.google.com/uc?id=1yFjYkLbXxcsG2s8Mk8XGGmLUHPaj8jnJ'

                zip_path = Path(image_set.root_path()) / "EIPH.zip"
                gdown.download(url, str(zip_path), quiet=True, proxy=form.data["proxy"])

                # unpack zip-file
                zip_ref = zipfile.ZipFile(str(zip_path), 'r')
                zip_ref.extractall(image_set.root_path())
                zip_ref.close()
                # delete zip-file
                os.remove(str(zip_path))

                filenames =  [Path(image_set.root_path())/f.filename for f in zip_ref.filelist if ".txt" not in f.filename]
                annotations_path = Path(image_set.root_path()) / "ground truth.txt"

                annotations = pd.read_csv(annotations_path, delimiter="|",names=["file","class","vector","1","2","3","4","5","6","7","8"])

                for file_path in filenames:
                    image = Image.objects.filter(filename=file_path.name,image_set=image_set).first()
                    if image is None:
                        try:
                            # creates a checksum for image
                            fchecksum = hashlib.sha512()
                            with open(file_path, 'rb') as fil:
                                buf = fil.read(10000)
                                fchecksum.update(buf)
                            fchecksum = fchecksum.digest()

                            image = Image(
                                name=file_path.name,
                                image_set=image_set,
                                checksum=fchecksum)

                            image.save_file(file_path)

                            image_annotations = annotations[annotations["file"] == file_path.name]

                            # save annotations for image
                            for label, vector in zip(image_annotations["class"], image_annotations["vector"]):
                                label = str(label)
                                if label in labels:
                                    vector = json.loads(vector)
                                    vector["x1"], vector["x2"], vector["y1"], vector["y2"] = int(vector["x1"]), int(vector["x2"]), int(vector["y1"]), int(vector["y2"])
                                    annotation_type = labels[label]
                                    anno = Annotation.objects.create(
                                        annotation_type = annotation_type,
                                        user = request.user,
                                        image = image,
                                        vector = vector 
                                    )

                        except Exception as e:
                            errors.append(e.message)

            # view image set
            return view_imageset(request, image_set.id)


    # If this is a GET (or any other method) create the default form.
    form = DatasetForm(user=request.user)

    context = {
        'eiph_miccai_form': form,
    }

    return TemplateResponse(request, 'eiph_miccai_form.html', context)


def create_asthma_dataset(request):

    # If this is a POST request then process the Form data
    if request.method == 'POST':
        
        # Create a form instance and populate it with data from the request (binding):
        form = DatasetForm(request.POST)

        # Check if the form is valid:
        if form.is_valid():
            team = get_object_or_404(Team, id=form.data['team'])
            image_set_name = form.data["name"]
            product_name = form.data["name"]+" Product"

            url = 'https://drive.google.com/uc?id=1_w_AcWa54yj1Ye4H4loEfBtgl4hvQFSp'
            annotations_path = download_path / "Asthma_Annotations.pkl"
            gdown.download(url, str(annotations_path), quiet=True, proxy=form.data["proxy"])

            # create imageset, product and annotation type etc.
            with transaction.atomic():
                labels = {'Mastzellen':None, "Makrophagen":None, "Neutrophile":None, "Eosinophile":None, "Lymohozyten":None}

                annotations = pd.read_pickle(annotations_path)
                annotations = annotations[annotations["deleted"] == False]
                annotations = annotations[annotations["class"].isin(labels.keys())]

                # create or load product
                product = Product.objects.filter(name=product_name,team=team).first()
                if product is None:
                    product = Product.objects.create(
                        name=product_name,
                        team=team,
                        creator=request.user
                    )
                    product.save()

                # create or load AnnotationType
                for label in labels.keys():
                    anno_type = AnnotationType.objects.filter(name=label,product=product).first()
                    if anno_type is None:
                        anno_type = AnnotationType.objects.create(
                            name=label,
                            vector_type=1,
                            product=product
                        )

                    labels[label] = anno_type

                #create imageset 
                image_set = ImageSet.objects.filter(name=image_set_name,team=team).first()
                if image_set is None:
                    image_set = ImageSet.objects.create(
                        team = team,
                        creator = request.user,
                        name = image_set_name,
                        product=[product]
                    )
                    image_set.create_folder()

                #create images

                url = 'https://drive.google.com/uc?id='

                file_path = Path(image_set.root_path()) / "BAL AIA Blickfang Luft.svs"
                gdown.download(url, str(file_path), quiet=True, proxy=form.data["proxy"])

                image = Image.objects.filter(filename=file_path.name,image_set=image_set).first()
                if image is None:
                    try:
                        # creates a checksum for image
                        fchecksum = hashlib.sha512()
                        with open(file_path, 'rb') as fil:
                            buf = fil.read(10000)
                            fchecksum.update(buf)
                        fchecksum = fchecksum.digest()

                        image = Image(
                            name=file_path.name,
                            image_set=image_set,
                            checksum=fchecksum)

                        image.save_file(file_path)

                        annotations = annotations[annotations["image_name"] == file_path.name]

                        # save annotations for image
                        for label, vector, uuid in zip(annotations["class"], annotations["vector"], annotations["unique_identifier"]):

                            annotation_type = labels[label]
                            anno = Annotation.objects.filter(unique_identifier=uuid,image=image).first()
                            if anno is None:
                                anno = Annotation.objects.create(
                                    annotation_type = annotation_type,
                                    unique_identifier = uuid,
                                    user = request.user,
                                    image = image,
                                    vector = vector 
                                )


                    except Exception as e:
                        errors.append(e.message)

            # view image set
            return view_imageset(request, image_set.id)


    # If this is a GET (or any other method) create the default form.
    form = DatasetForm(user=request.user)

    context = {
        'asthma_form': form,
    }

    return TemplateResponse(request, 'dataset_asthma.html', context)


def create_eiph_dataset(request):

    # If this is a POST request then process the Form data
    if request.method == 'POST':
        
        # Create a form instance and populate it with data from the request (binding):
        form = DatasetForm(request.POST)

        # Check if the form is valid:
        if form.is_valid():
            team = get_object_or_404(Team, id=form.data['team'])
            image_set_name = form.data["name"]
            product_name = form.data["name"]+" Product"

            url = 'https://drive.google.com/uc?id='
            annotations_path = download_path / "05_EIPH_BerlinerBalu.txt"
            gdown.download(url, str(annotations_path), quiet=True, proxy=form.data["proxy"])

            # create imageset, product and annotation type etc.
            with transaction.atomic():
                labels = {'0':None, "1":None, "2":None, "3":None, "4":None}

                annotations = pd.read_csv(annotations_path, delimiter="|",names=["file","class","vector"])

                # create or load product
                product = Product.objects.filter(name=product_name,team=team).first()
                if product is None:
                    product = Product.objects.create(
                        name=product_name,
                        team=team,
                        creator=request.user
                    )
                    product.save()

                # create or load AnnotationType
                for label in labels.keys():
                    anno_type = AnnotationType.objects.filter(name=label,product=product).first()
                    if anno_type is None:
                        anno_type = AnnotationType.objects.create(
                            name=label,
                            vector_type=1,
                            product=product
                        )

                    labels[label] = anno_type

                #create imageset 
                image_set = ImageSet.objects.filter(name=image_set_name,team=team).first()
                if image_set is None:
                    image_set = ImageSet.objects.create(
                        team = team,
                        creator = request.user,
                        name = image_set_name,
                        product=[product]
                    )
                    image_set.create_folder()

                #create images

                url = 'https://drive.google.com/uc?id=1N0tOpj-tVnTHkQIp15lSxn7HZbGJQ_qQ'

                file_path = Path(image_set.root_path()) / "26_EIPH_566482 L Berliner Blau.svs"
                gdown.download(url, str(file_path), quiet=True, proxy=form.data["proxy"])

                image = Image.objects.filter(filename=file_path.name,image_set=image_set).first()
                if image is None:
                    try:
                        # creates a checksum for image
                        fchecksum = hashlib.sha512()
                        with open(file_path, 'rb') as fil:
                            buf = fil.read(10000)
                            fchecksum.update(buf)
                        fchecksum = fchecksum.digest()

                        image = Image(
                            name=file_path.name,
                            image_set=image_set,
                            checksum=fchecksum)

                        image.save_file(file_path)

                        # save annotations for image
                        for label, vector in zip(annotations["class"], annotations["vector"]):

                            vector = json.loads(vector)
                            annotation_type = labels[str(label)]
                            anno = Annotation.objects.create(
                                annotation_type = annotation_type,
                                user = request.user,
                                image = image,
                                vector = vector 
                            )


                    except Exception as e:
                        errors.append(e.message)

            # view image set
            return view_imageset(request, image_set.id)


    # If this is a GET (or any other method) create the default form.
    form = DatasetForm(user=request.user)

    context = {
        'asthma_form': form,
    }

    return TemplateResponse(request, 'dataset_asthma.html', context)




