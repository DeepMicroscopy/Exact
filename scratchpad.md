docker run -d -p8081:8080 -p 54320:5432 -p 13370:80 -p 63790:6379 --env NVIDIA_DISABLE_REQUIRE=1 --gpus all --name "exact-dev" -v "exact-dev:/workspace" -v "D:\:/host_Data" -v "/var/run/docker.sock:/var/run/docker.sock" --restart always gestaltmldev.azurecr.io/gs-mlworkspace-min-gpu:latest

Image Source URL
http://127.0.0.1:8000/images/image/61/1/1/tile$name='view_image'