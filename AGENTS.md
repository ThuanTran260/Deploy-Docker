# 🤖 HƯỚNG DẪN DÀNH CHO CÁC AGENT (AI ASSISTANT PLAYBOOK)
## Quản trị Triển khai Docker lên AWS EC2 (Zero-Cost & High-Stability)

Tài liệu này là quy chuẩn bắt buộc (**Standard Operating Procedure - SOP**) dành cho mọi AI Agent khi hỗ trợ người dùng thực hành, cấu hình, và triển khai các ứng dụng container hóa bằng Docker lên dịch vụ đám mây **AWS EC2 (VPS)** trong khuôn khổ dự án này.

---

## ⛔ 1. RÀO CHẮN AN TOÀN TỐI THƯỢNG (CRITICAL SAFETY GATES)

Mọi Agent tương tác với người dùng hoặc hệ thống **BẮT BUỘC** phải tuân thủ nghiêm ngặt các điều răn sau:

### 1.1. Phòng Chống "Đốt Tiền" AWS (Zero Overpay Policy)
* **TUYỆT ĐỐI KHÔNG** hướng dẫn người dùng khởi tạo các dịch vụ doanh nghiệp tính phí cố định đắt đỏ:
  * ❌ **Không tạo NAT Gateway** ($\approx \$35 - \$70/\text{tháng}$).
  * ❌ **Không tạo Application / Network Load Balancer (ALB/NLB)** ($\approx \$25/\text{tháng}$).
  * ❌ **Không tạo Elastic IP (EIP) mồ côi** không gắn vào instance đang chạy. Từ 2024, AWS phạt phí cho mọi IPv4 thừa. Luôn hướng dẫn dùng **Auto-assign Public IPv4**.
  * ❌ **Không nâng cấp dung lượng ổ cứng EBS vượt quá 30 GiB** (hạn mức miễn phí của AWS Free Tier).
  * ❌ **Không chọn sai cấu hình máy ảo:** Chỉ hướng dẫn chọn `t2.micro` hoặc `t3.micro` (có nhãn xanh **Free tier eligible**).

### 1.2. Bảo Vệ Thông Tin Bí Mật (Credentials & Secret Safety)
* **TUYỆT ĐỐI KHÔNG** yêu cầu hoặc hướng dẫn người dùng tạo `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` cấp Administrator để dùng local nếu bài lab chỉ cần SSH.
* **CẢNH BÁO LIÊN TỤC:** Nhắc người dùng không bao giờ commit file khóa riêng tư `*.pem`, `*.key` hoặc file `.env` lên GitHub công khai. Bot đào tiền ảo có thể làm bốc hơi hàng nghìn USD chỉ sau vài phút.

### 1.3. Quy Tắc Git (No Push Policy)
* Agent **KHÔNG BAO GIỜ** được tự ý thực thi lệnh `git push` hoặc `git push --force` lên remote repository. Chỉ thực hiện các lệnh local (`git add`, `git commit`, `git status`). Việc đẩy code lên remote phải để người dùng tự xác nhận và gõ lệnh.

---

## 🧭 2. QUY TRÌNH 5 GIAI ĐOẠN HƯỚNG DẪN NGƯỜI DÙNG (5-PHASE SOP)

Agent phải dẫn dắt người dùng tuần tự qua từng Phase, không cung cấp quá nhiều thông tin dồn dập trong một lượt trả lời.

```
[Phase 0: Phanh an toàn] ──► [Phase 1: Tạo EC2] ──► [Phase 2: SSH & Swap] ──► [Phase 3: Cài Docker] ──► [Phase 4: Run Container] ──► [Phase 5: Dọn dẹp]
```

---

### Phase 0: Kích Hoạt Phanh An Toàn (AWS Budgets)
*Trước khi người dùng tạo bất kỳ dịch vụ nào, Agent phải kiểm tra và nhắc nhở:*
1. Hướng dẫn người dùng vào **AWS Budgets** $\rightarrow$ Tạo **Zero spend budget** hoặc đặt ngưỡng cảnh báo **$1.00 USD**.
2. Nhập Email cá nhân để nhận thông báo khẩn ngay khi tài khoản phát sinh bất kỳ khoản phí nào $> \$0.01$.

---

### Phase 1: Tạo Máy Ảo EC2 Chuẩn Free Tier
*Hướng dẫn người dùng các tham số chuẩn trên AWS Console:*
1. **Region:** Chọn gần Việt Nam: `ap-southeast-1` (Singapore) hoặc `ap-northeast-1` (Tokyo).
2. **OS Image:** `Ubuntu Server 24.04 LTS (HVM), SSD Volume Type` (Free tier eligible).
3. **Instance Type:** `t2.micro` (hoặc `t3.micro`).
4. **Key Pair:** Tạo mới dạng `RSA`, format `.pem` (ví dụ `calculator-key.pem`).
5. **Network / Security Group (Tường lửa):**
   * Cho phép SSH: Port `22` (Nguồn: `My IP` hoặc `0.0.0.0/0`).
   * Cho phép HTTP: Port `80` (Nguồn: `0.0.0.0/0` - Anywhere).
6. **Storage:** Giữ `8 GiB gp3` mặc định.

---

### Phase 2: Kết Nối SSH & Gia Cố Bộ Nhớ (Swap Memory)
1. **Sửa quyền file `.pem` (Tránh lỗi SSH từ chối):**
   * *Trên Windows (PowerShell):*
     ```powershell
     icacls "calculator-key.pem" /inheritance:r
     icacls "calculator-key.pem" /grant:r "$($env:USERNAME):(R)"
     ```
   * *Trên Linux / macOS / Git Bash:*
     ```bash
     chmod 400 calculator-key.pem
     ```
2. **Lệnh kết nối SSH:**
   ```bash
   ssh -i "calculator-key.pem" ubuntu@<Public_IPv4_Cua_EC2>
   ```
3. **Kích hoạt Swap 1GB (Cực kỳ quan trọng để t2.micro không bị treo):**
   ```bash
   sudo fallocate -l 1G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

---

### Phase 3: Cài Đặt Docker Engine & Phân Quyền
*Cài đặt bản chính thức và cấp quyền cho user `ubuntu` để không cần gõ `sudo`:*
```bash
# 1. Cài đặt Docker tự động
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. Phân quyền cho user hiện tại
sudo usermod -aG docker $USER

# 3. Kích hoạt quyền ngay lập tức trong phiên hiện tại
newgrp docker

# 4. Kiểm tra
docker version
```

---

### Phase 4: Triển Khai Container Ứng Dụng
1. **Lấy mã nguồn:**
   ```bash
   git clone https://github.com/ThuanTran260/Deploy-Docker.git
   cd Deploy-Docker
   ```
2. **Build & Chạy Container:**
   ```bash
   # Cách 1: Dùng Docker trực tiếp
   docker build -t calculator-app .
   docker run -d --name my_calculator --restart always -p 80:80 calculator-app

   # Cách 2: Hoặc dùng Docker Compose
   docker compose up -d
   ```
3. **Kiểm tra trạng thái container:**
   ```bash
   docker ps
   ```

---

### Phase 5: Hậu Kiểm Tra & Hướng Dẫn Thu Dọn (Cleanup)
1. **Kiểm tra:** Yêu cầu người dùng mở trình duyệt gõ: `http://<Public_IPv4_Cua_EC2>`.
2. **Cảnh báo dọn dẹp (Quan trọng để giữ chi phí 0đ):**
   * Nếu người dùng chỉ làm bài lab/đồ án ngắn hạn: Nhắc nhở vào AWS Console $\rightarrow$ Chọn Instance $\rightarrow$ **Instance State** $\rightarrow$ **Terminate Instance** để hủy vĩnh viễn cả máy ảo và ổ cứng EBS, tránh bị tính phí ngầm khi hết hạn 12 tháng Free Tier.

---

## 🛠️ 3. BẢNG PHẢN XẠ XỬ LÝ SỰ CỐ (TROUBLESHOOTING MATRIX)

Khi người dùng báo lỗi, Agent tra cứu nhanh bảng sau để đưa ra giải pháp ngay lập tức:

| Hiện tượng / Thông báo lỗi | Nguyên nhân gốc rễ | Hướng dẫn khắc phục cho Agent |
| :--- | :--- | :--- |
| `ssh: connect to host ... port 22: Connection timed out` | Security Group chưa mở Inbound port 22, hoặc bạn chọn "My IP" nhưng mạng WiFi vừa đổi IP public | Hướng dẫn người dùng vào AWS Console $\rightarrow$ **Security Groups** $\rightarrow$ Edit Inbound Rules $\rightarrow$ Chuyển SSH về `Anywhere-IPv4 (0.0.0.0/0)` tạm thời để test. |
| `WARNING: UNPROTECTED PRIVATE KEY FILE!` | File `.pem` có quyền quá lỏng lẻo, OpenSSH từ chối đọc | Chạy lệnh `icacls` (trên Windows) hoặc `chmod 400` (trên Linux/macOS) như ở Phase 2. |
| `permission denied while trying to connect to the Docker daemon socket` | User `ubuntu` chưa được thêm vào group `docker` hoặc chưa reload session | Chạy: `sudo usermod -aG docker $USER && newgrp docker`. |
| Container đang chạy (`docker ps` thấy UP) nhưng trình duyệt báo "Cannot connect" | 1. Security Group chưa mở cổng 80.<br>2. Trình duyệt tự nhảy sang `https://` thay vì `http://`. | 1. Mở Inbound Rule HTTP port 80 cho `0.0.0.0/0`.<br>2. Nhắc người dùng gõ rõ `http://<IP>` (không có chữ 's'). |
| Máy ảo bị đơ, SSH tự ngắt khi đang chạy `docker build` | Máy `t2.micro` bị hết RAM (OOM - Out of Memory) | Khởi động lại máy ảo trên Console, sau đó ngay lập tức cấu hình **Swap 1GB** theo lệnh ở Phase 2 trước khi build lại. |
| Web vào được nhưng giao diện vỡ / không bấm được số | Lỗi đường dẫn file tĩnh hoặc phân quyền file Nginx | Đảm bảo `Dockerfile` copy đúng cả 3 file: `index.html`, `style.css`, `script.js` vào `/usr/share/nginx/html/`. |

---

## 📋 4. NGUYÊN TẮC GIAO TIẾP VỚI NGƯỜI DÙNG

1. **Một việc tại một thời điểm:** Chia nhỏ hành động thành các bước ngắn, rõ ràng. Tránh thả một bài hướng dẫn 50 dòng khiến người dùng bối rối.
2. **Yêu cầu bằng chứng trước khi khẳng định:** Khi người dùng gặp lỗi, yêu cầu họ cung cấp output của `docker ps`, `curl -I localhost`, hoặc kiểm tra Security Group trước khi phỏng đoán.
3. **Độ an toàn là ưu tiên số 1:** Luôn luôn kiểm tra xem người dùng có đang làm thao tác nào kích hoạt chi phí không mong muốn hay không.
