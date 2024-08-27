# Image registration with EXACT

```
Registration works best for cytological questions and when the same slide has been stained twice.  As also described in the paper. 
```

The registration of images is based on code from the following [repository](https://github.com/ChristianMarzahl/WsiRegistration) and publication. 

```
@inproceedings{marzahl2021robust,
  title={Robust Quad-Tree based Registration on Whole Slide Images},
  author={Marzahl, Christian and Wilm, Frauke and Tharun, Lars and Perner, Sven and Bertram, Christof A and Kr{\"o}ger, Christine and Voigt, J{\"o}rn and Klopfleisch, Robert and Maier, Andreas and Aubreville, Marc and others},
  booktitle={MICCAI Workshop on Computational Pathology},
  pages={181--190},
  year={2021},
  organization={PMLR}
}
```

## Video

A demonstration of what registration in EXACT looks like is available at the following YoutTube video 


[![Datasets](https://img.youtube.com/vi/hduXtr6EaMA/0.jpg)](https://www.youtube.com/watch?v=hduXtr6EaMA) 


## Tutorial

1) Please upload the images you want to register. The images do not have to be in the same ImageSet folder. 
2) Please open the Notebook: https://github.com/DeepMicroscopy/Exact/blob/master/doc/WSI-Registration.ipynb
3) The important line is "In [7]": 
```Python
registration = image_registration_api.register_image(source_image=source_image.id, target_image=target_image.id,thumbnail_size=thumbnail_size)

```
The source and target image id is visibile in the browser: 
```Python
http://localhost:1337/annotations/{id}
```
The thumbnail_size is an optional parameter
