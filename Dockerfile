FROM nginx:1.27-alpine

# Custom server config (gzip, caching, security headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static assets to the Nginx web directory
COPY index.html vilecut.html style.css robots.txt sitemap.xml CNAME /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/
COPY fonts/ /usr/share/nginx/html/fonts/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
