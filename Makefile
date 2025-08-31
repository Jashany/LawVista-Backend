APP_NAME=lawapi-backend
IMAGE_NAME=jashanpreet/lawapi-backend
CONTAINER_NAME=lawapi-backend
NGINX_CONF=lawVista.conf
DOMAIN=lawapi.jsondev.in
EMAIL=jashan.maybe76@gmail.com  # used for certbot registration

.PHONY: build run stop setup-nginx enable-https renew-certs

build:
	docker build . -t $(IMAGE_NAME)

run:
	-docker ps -aq --filter "name=$(CONTAINER_NAME)" | xargs -r docker rm -f
	docker run --name $(CONTAINER_NAME) -p 3000:3000 -d $(IMAGE_NAME)

stop:
	-docker ps -aq --filter "name=$(CONTAINER_NAME)" | xargs -r docker rm -f

setup-nginx:
	sudo cp $(NGINX_CONF) /etc/nginx/sites-available/$(NGINX_CONF)
	sudo ln -fs /etc/nginx/sites-available/$(NGINX_CONF) /etc/nginx/sites-enabled/
	sudo nginx -t
	sudo systemctl reload nginx

enable-https:
	sudo certbot --nginx -d $(DOMAIN) --non-interactive --agree-tos -m $(EMAIL)

renew-certs:
	sudo certbot renew --quiet
