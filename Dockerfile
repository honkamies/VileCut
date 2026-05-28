FROM nginx:alpine

# Copy static assets to Nginx web directory
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/
COPY fonts/ /usr/share/nginx/html/fonts/

# Expose port 80 for web traffic
EXPOSE 80

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
