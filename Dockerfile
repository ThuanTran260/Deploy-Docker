# Sử dụng image Nginx Alpine siêu nhẹ (~23MB), bảo mật và tối ưu RAM cho AWS EC2 Free Tier
FROM nginx:alpine

# Xóa các file tĩnh mặc định của Nginx
RUN rm -rf /usr/share/nginx/html/*

# Sao chép toàn bộ mã nguồn của Calculator App vào thư mục phục vụ web của Nginx
COPY index.html style.css script.js /usr/share/nginx/html/

# Mở cổng 80 (cổng HTTP chuẩn)
EXPOSE 80

# Chạy Nginx ở chế độ foreground (tiến trình chính cho container)
CMD ["nginx", "-g", "daemon off;"]
