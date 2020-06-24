# Philips iSyntax Support

If the Docker EXACT-Server should support Philips iSyntax format please copy the following files into this folder:

## pathologysdk-modules
- philips-pathologysdk-eglrendercontext_2.2.11-1_amd64.deb
- philips-pathologysdk-gles2renderbackend_2.2.11-1_amd64.deb
- philips-pathologysdk-gles3renderbackend_2.2.11-1_amd64.deb
- philips-pathologysdk-pixelengine_2.2.11-1_amd64.deb
- philips-pathologysdk-softwarerenderer_2.2.11-1_amd64.deb

## pathologysdk-python36-modules
- philips-pathologysdk-python3-eglrendercontext_2.2.11-1_all.deb
- philips-pathologysdk-python3-gles2renderbackend_2.2.11-1_all.deb
- philips-pathologysdk-python3-gles3renderbackend_2.2.11-1_all.deb
- philips-pathologysdk-python3-pixelengine_2.2.11-1_all.deb
- philips-pathologysdk-python3-softwarerenderbackend_2.2.11-1_all.deb
- philips-pathologysdk-python3-softwarerendercontext_2.2.11-1_all.deb

For more information please visit: https://www.openpathology.philips.com/pathologysdk/

## Docker container 

Build and run the container:
```
docker-compose -f docker-compose.iSyntax.prod.yml up -d --build
```