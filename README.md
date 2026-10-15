# ☕ BrewLite — Triển Khai Hệ Thống Đặt Cà Phê Không Tiền Mặt Bằng Docker Lên AWS EC2

Dự án fullstack **BrewLite (Cashless Coffee Ordering System)** hiện đại, lấy cảm hứng từ Starbucks Design System, được đóng gói container hóa toàn diện bằng **Docker Compose** và tối ưu hóa vận hành mượt mà trên đám mây **AWS EC2 Free Tier (`t2.micro` / `t3.micro`)** với chi phí **0 VNĐ**.

---

## 👥 1. Các Phân Quyền Người Dùng (Role-Based Access Control)

Hệ thống hỗ trợ 3 phân quyền người dùng độc lập theo mô hình RBAC:

| Vai trò (Role) | Email tài khoản mẫu | Phạm vi quyền hạn & Chức năng |
|:---|:---|:---|
| 👑 **Quản trị viên (ADMIN)** | `admin@brewlite.vn` | Truy cập `/admin`: Quản lý thực đơn, cập nhật tồn kho tức thì, quản lý và điều chỉnh phân quyền nhân sự Barista/Staff. |
| ☕ **Nhân viên (STAFF)** | `staff@brewlite.vn` | Truy cập `/staff`: Màn hình Barista KDS dạng Kanban 3 cột — tiếp nhận đơn mới, chuyển trạng thái pha chế, hoàn tất đơn hàng. |
| 👤 **Khách hàng (CUSTOMER)** | `customer@brewlite.vn` | Truy cập `/`: Xem thực đơn, tùy biến size/topping, áp dụng voucher, thanh toán không tiền mặt, theo dõi đơn hàng và tích lũy điểm thưởng. |

> [!NOTE]  
> **Chính sách bảo mật (Security Policy):** Mật khẩu tài khoản mẫu và các tham số xác thực được lưu trữ an toàn trong biến môi trường (`.env`), không công khai trên mã nguồn mở. Khi cần thông tin kiểm thử nội bộ, vui lòng liên hệ quản trị viên dự án.

### 🎟️ Mã Khuyến Mãi Hỗ Trợ (Vouchers):
* **`WELCOME10`**: Giảm 10% cho đơn hàng có giá trị từ 50.000đ trở lên.
* **`FIXED20K`**: Giảm trực tiếp 20.000đ cho đơn hàng có giá trị từ 100.000đ trở lên.

---

## 🌐 2. Địa Chỉ Truy Cập Dịch Vụ (Endpoints)

Khi hệ thống đang vận hành trên máy chủ AWS EC2 (hoặc máy tính cục bộ):

* 🏠 **Trang chủ & Thực đơn:** `http://<Public_IPv4_EC2>/` (hoặc `http://localhost/`)
* 🔑 **Trang Đăng nhập:** `http://<Public_IPv4_EC2>/login`
* ☕ **Bảng điều khiển Barista KDS:** `http://<Public_IPv4_EC2>/staff`
* ⚙️ **Cổng Quản trị Admin:** `http://<Public_IPv4_EC2>/admin`
* 📜 **Lịch sử đơn hàng Khách hàng:** `http://<Public_IPv4_EC2>/orders/history`
* 🩺 **Kiểm tra trạng thái Backend API:** `http://<Public_IPv4_EC2>/api/health`
* 📦 **Danh mục sản phẩm qua API:** `http://<Public_IPv4_EC2>/api/products`

---

## 🏗️ 3. Kiến Trúc Hệ Thống (4-Tier Microservices)

Hệ thống được đóng gói thành 4 container độc lập liên kết qua Docker Bridge Network nội bộ:

```
                      [ Client Browser ]
                              │
                         Port 80 (HTTP)
                              ▼
                   ┌───────────────────────┐
                   │     brewlite_nginx    │ (Nginx Alpine Reverse Proxy)
                   └───────────┬───────────┘
                               │
            ┌──────────────────┴──────────────────┐
     Path: / (Port 3000)                   Path: /api (Port 3001)
            ▼                                     ▼
┌────────────────────────┐            ┌────────────────────────┐
│   brewlite_frontend    │            │    brewlite_backend    │
│  (Next.js 14 App Router│            │  (NestJS 10 REST API   │
│   Standalone Server)   │            │     + Prisma ORM)      │
└────────────────────────┘            └───────────┬────────────┘
                                                  │ Port 5432 (Internal)
                                                  ▼
                                      ┌────────────────────────┐
                                      │   brewlite_postgres    │
                                      │ (PostgreSQL 16 Alpine) │
                                      └────────────────────────┘
```

1. **`brewlite_nginx` (Nginx Alpine):** Lắng nghe duy nhất tại Port `80` công khai, làm Reverse Proxy định tuyến thông minh:
   - Điều hướng toàn bộ lưu lượng web `/` vào container Frontend.
   - Điều hướng toàn bộ request `/api/` vào container Backend.
   - Ngăn chặn hoàn toàn việc phơi lộ các cổng nội bộ (3000, 3001, 5432) ra internet.
2. **`brewlite_frontend` (Next.js 14 Standalone):** Giao diện bán hàng phản hồi tức thì, tối ưu SEO, hỗ trợ Responsive và chuẩn trợ năng Accessibility (WCAG 2.1 AA / web.dev).
3. **`brewlite_backend` (NestJS 10 + Prisma):** Kiến trúc Module hướng dịch vụ, xử lý giao dịch thanh toán Idempotent an toàn, State Machine đơn hàng và nạp dữ liệu mẫu tự động.
4. **`brewlite_postgres` (PostgreSQL 16 Alpine):** Cơ sở dữ liệu quan hệ lưu trữ dữ liệu bền vững qua Docker Volume `pgdata`.

---

## 💻 4. Hướng Dẫn Khởi Chạy Local (Docker Desktop)

Nếu muốn chạy thử nghiệm trên máy tính cá nhân đã cài Docker:

```bash
# 1. Clone repository
git clone https://github.com/ThuanTran260/Deploy-Docker.git
cd Deploy-Docker

# 2. Khởi chạy toàn bộ 4 dịch vụ bằng 1 lệnh duy nhất
docker compose up -d --build

# 3. Kiểm tra trạng thái các container
docker compose ps
```
👉 Truy cập: `http://localhost/`

---

## ☁️ 5. Quy Trình Triển Khai Chi Tiết Lên AWS EC2 (0 VNĐ)

### Bước 1: Chuẩn bị SSH Key
* **Windows (PowerShell):**
  ```powershell
  icacls "<your-key-pair>.pem" /inheritance:r
  icacls "<your-key-pair>.pem" /grant:r "$($env:USERNAME):(R)"
  ```
* **macOS / Linux / Git Bash:**
  ```bash
  chmod 400 <your-key-pair>.pem
  ```

### Bước 2: Kết nối SSH vào máy ảo EC2
```bash
ssh -i "<your-key-pair>.pem" ubuntu@<Public_IPv4_Cua_EC2>
```

### Bước 3: Kích hoạt Swap 1GB (Chống tràn RAM trên t2.micro / t3.micro)
```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Bước 4: Cài đặt Docker Engine & Docker Compose
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
docker version
```

### Bước 5: Kéo mã nguồn và Khởi chạy Container
```bash
git clone https://github.com/ThuanTran260/Deploy-Docker.git
cd Deploy-Docker
docker compose up -d --build
```

---

## 🛠️ 6. Các Lệnh Quản Trị Hệ Thống Hữu Ích

```bash
# Xem log thời gian thực của toàn bộ hệ thống
docker compose logs -f

# Xem log riêng của Backend
docker compose logs -f backend

# Xem log riêng của Nginx
docker compose logs -f nginx

# Khởi động lại dịch vụ
docker compose restart

# Dừng hệ thống an toàn
docker compose down
```

---

## 🛡️ 7. Rào Chắn An Toàn Chi Phí & Bảo Mật (Zero-Cost & DevSecOps)

1. **Bảo mật thông tin xác thực:** Tuyệt đối không commit file khóa riêng tư `*.pem`, `*.key` hoặc file biến môi trường chứa `JWT_SECRET`, mật khẩu cơ sở dữ liệu lên kho mã nguồn công khai.
2. **AWS Budgets:** Luôn đặt ngân sách cảnh báo **$1.00 USD** gửi thông báo về email cá nhân ngay khi phát sinh bất kỳ khoản phí nhỏ nào.
3. **Không tạo Elastic IP (EIP) mồ côi:** Chỉ sử dụng Public IPv4 tự động gán đi kèm instance.
4. **Không tạo dịch vụ trả phí cố định:** Không tạo NAT Gateway (~$35/tháng) hay Application Load Balancer (~$25/tháng).
5. **Hủy tài nguyên khi hoàn thành môn học/đồ án:**
   - Vào AWS Console $\rightarrow$ **EC2** $\rightarrow$ **Instances** $\rightarrow$ Chọn instance $\rightarrow$ **Instance State** $\rightarrow$ **Terminate Instance** để hủy vĩnh viễn máy ảo và ổ cứng EBS đi kèm, đảm bảo chi phí 0 VNĐ trọn đời.
