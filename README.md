# 🚀 Cloud Calculator - Triển Khai Docker Lên AWS EC2 (VPS)

Dự án máy tính bỏ túi (**Cloud Calculator**) hiện đại, siêu nhẹ, được đóng gói bằng **Docker** và tối ưu hóa chuyên biệt để vận hành trơn tru trên **AWS EC2 Free Tier (`t2.micro` / `t3.micro`)**.

---

## 📌 1. Kiến trúc & Công nghệ

* **Frontend:** HTML5, CSS3 Glassmorphism, JavaScript thuần (Hỗ trợ bàn phím, chống tràn số, responsive mọi màn hình).
* **Web Server:** `nginx:alpine` (Dung lượng image chỉ **~23 MB**, chiếm dưới **8 MB RAM**).
* **Hạ tầng Cloud:** AWS EC2 Ubuntu 24.04 LTS (Free Tier Eligible).
* **Cổng phục vụ:** Port `80` (HTTP).

---

## 💻 2. Chạy thử nghiệm ở máy Local

Nếu máy tính cá nhân của bạn đã cài Docker Desktop:

```bash
# Build image
docker build -t cloud-calculator .

# Khởi chạy container
docker run -d -p 8080:80 --name my_calculator cloud-calculator
```
👉 Mở trình duyệt và truy cập: `http://localhost:8080`

---

## ☁️ 3. Quy trình triển khai chi tiết lên AWS EC2

### Bước 1: Phân quyền SSH Key trên Windows / Linux / macOS

* **Trên Windows PowerShell:**
```powershell
icacls "calculator-key.pem" /inheritance:r
icacls "calculator-key.pem" /grant:r "$($env:USERNAME):(R)"
```

* **Trên macOS / Linux / Git Bash:**
```bash
chmod 400 calculator-key.pem
```

---

### Bước 2: SSH vào máy ảo EC2

```bash
ssh -i "calculator-key.pem" ubuntu@<Public_IPv4_Cua_EC2>
```

---

### Bước 3: Tạo bộ nhớ ảo Swap 1GB (Bí kíp chống tràn RAM trên t2.micro)

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

### Bước 4: Cài đặt Docker Engine & Phân quyền User

```bash
# Cài đặt Docker chính thức qua script tự động
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Cấp quyền chạy Docker không cần gõ sudo
sudo usermod -aG docker $USER

# Kích hoạt nhóm quyền mới ngay lập tức
newgrp docker
```

---

### Bước 5: Kéo mã nguồn & Khởi chạy Container

```bash
# 1. Clone repository về VPS
git clone https://github.com/ThuanTran260/Deploy-Docker.git
cd Deploy-Docker

# 2. Build Docker Image
docker build -t calculator-app .

# 3. Khởi chạy Container ở chế độ ngầm (-d) trên cổng 80
docker run -d --name calculator_web --restart always -p 80:80 calculator-app
```

> **Hoặc dùng Docker Compose (Nhanh gọn):**
> ```bash
> docker compose up -d
> ```

---

## 🌐 4. Kiểm tra thành quả

Mở trình duyệt trên máy tính hoặc điện thoại, nhập địa chỉ:
```
http://<Public_IPv4_Cua_EC2>
```
*(Đảm bảo trong **Security Group** của EC2 bạn đã mở cổng **Inbound: HTTP - Port 80 - 0.0.0.0/0**).*

---

## 🐳 5. Phân phối lên Docker Hub (Tùy chọn)

Nếu muốn chia sẻ image cho các bạn khác trong nhóm chạy thử mà không cần build:

```bash
# Đăng nhập Docker Hub
docker login

# Đặt tag image theo tên tài khoản Docker Hub của bạn
docker tag calculator-app <dockerhub_username>/calculator-app:v1.0

# Đẩy image lên Docker Hub
docker push <dockerhub_username>/calculator-app:v1.0
```

---

## 🛡️ 6. An toàn chi phí Free Tier

1. **AWS Budgets:** Luôn đặt ngân sách cảnh báo **$1 USD** gửi về email để phát hiện sớm bất kỳ chi phí phát sinh nào.
2. **Không tạo Elastic IP thừa:** Dùng Public IPv4 tự động gán.
3. **Dọn dẹp sau khi nộp bài/kết thúc đồ án:**
   * Vào AWS Console $\rightarrow$ Chọn Instance `docker-calculator-server` $\rightarrow$ **Instance State** $\rightarrow$ **Terminate Instance** để tiêu hủy hoàn toàn máy ảo và ổ cứng EBS, đảm bảo chi phí luôn là **0 VNĐ**.
