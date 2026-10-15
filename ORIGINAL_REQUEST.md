# Original User Request

## Initial Request — 2026-10-09T11:44:04Z

Deploy the fullstack Monorepo application CNPM-BrewLite (Next.js 14, NestJS 10, PostgreSQL 16) onto an existing AWS EC2 instance (Ubuntu 24.04, t3.micro) to replace the existing calculator container, preserving the existing SSH key (`calculator-key.pem`), keeping cost at 0 VNĐ (Free Tier), and exposing the application over public HTTP. Use the full team of agents for architecture review, implementation, security auditing, and verification. Prioritize resource and credit efficiency; pause and alert the user if any conflict arises. Crucially, verify that the complete end-to-end workflow functions smoothly: customer ordering, Barista KDS (`/staff`), and the Admin portal (`/admin`).

Working directory: `e:\QuanTriMang\Deploy-Docker`
Integrity mode: development

Reference repository: https://github.com/ThuanTran260/CNPM-BrewLite.git

## Requirements

### R1. Teardown Calculator & Port Release
Safely stop and remove the running `cloud_calculator_app` container and any dangling calculator resources on the EC2 instance, releasing port 80 cleanly without touching SSH keys or interrupting the SSH daemon.

### R2. Fullstack Deployment via Docker Compose
Deploy the 3-tier BrewLite application stack (PostgreSQL 16 Alpine, NestJS 10 REST API with Prisma ORM, and Next.js 14 Standalone Frontend) using Docker Compose on the EC2 instance. Ensure database migrations and initial seed data (admin, staff, customer, vouchers, menu) execute reliably on container startup.

### R3. Single-Port Nginx Reverse Proxy Architecture
Implement a unified Nginx Reverse Proxy listening on public Port 80:
- Route root web traffic `/` to the Next.js Frontend container (port 3000).
- Route API traffic `/api/` to the NestJS Backend container (port 3001).
- Restrict PostgreSQL port 5432 to the internal Docker bridge network only.
- Ensure client-side browser requests call `/api` directly through port 80, eliminating CORS issues and external port exposure.

### R4. Resource Optimization & Conflict Guardrails
Ensure memory consumption is strictly contained within the EC2 Free Tier limits (1GB RAM + Swap). If any conflict, resource threshold breach, or port contention arises, stop and notify the user immediately for review. Maintain AWS cost at 0 VNĐ.

### R5. End-to-End Functional Verification
Verify all key workflows end-to-end:
1. Customer storefront: View drinks, customize size/toppings, apply voucher (`WELCOME10`), submit order.
2. Barista KDS (`/staff`): Barista views order in Kanban column, transitions state to brewing and completed.
3. Admin Portal (`/admin`): Admin manages staff, views reports, adjusts inventory.

## Verification Plan & Resources

### Programmatic Verification
1. **Frontend Availability:** `curl -I http://18.141.195.77/` returns `HTTP/1.1 200 OK` with BrewLite HTML content.
2. **Backend API Health:** `curl -s http://18.141.195.77/api/health` returns `200 OK` status JSON.
3. **Database Seed Integrity:** Query `/api/products` to verify drinks and sizes are seeded.
4. **Container Health:** `ssh -i "calculator-key.pem" ubuntu@18.141.195.77 "sudo docker ps"` reports all containers healthy.
5. **Security Check:** Confirm port 5432 is not exposed to the public internet.

## Acceptance Criteria

### Core Deliverables
- [ ] Existing Calculator container stopped and removed; Port 80 released.
- [ ] BrewLite Frontend rendered at `http://18.141.195.77` without specifying custom port.
- [ ] Backend API functional under `/api` path prefix with active database connectivity.
- [ ] Seed accounts (`admin@brewlite.vn`, `staff@brewlite.vn`, `customer@brewlite.vn`) can log in.
- [ ] Customer ordering, Barista KDS, and Admin portal tested and responsive.
- [ ] SSH connection via `calculator-key.pem` remains intact.
- [ ] Zero additional AWS costs incurred (strictly within Free Tier).
- [ ] Any port or configuration conflict is reported to the user prior to mutating actions.

## Follow-up — 2026-10-09T12:35:12Z

The user has started the EC2 instance and provided the new Public IPv4 address: 13.212.123.26.
SSH connectivity with calculator-key.pem has been verified successfully (SSH_CONNECTED).
Swap is active (1.0Gi).
The existing calculator container cloud_calculator_app is currently running on port 80.
Please proceed with Milestone M2 (teardown calculator, release port 80) and deploy CNPM-BrewLite to 13.212.123.26.

## Follow-up — 2026-10-10T13:33:52Z

This is a single self-contained fix; keep it small and focused.

Khắc phục lỗi điều hướng phân quyền (redirect loop) khi thoát tài khoản Staff/Admin và đăng nhập lại bằng Customer trên ứng dụng BrewLite (`http://13.212.123.26/login?redirect=/staff`), đồng thời chuẩn hóa khả năng tiếp cận (Accessibility - a11y) theo tiêu chuẩn web.dev cho trang Đăng nhập.

Working directory: `e:\QuanTriMang\Deploy-Docker`
Integrity mode: development

## Requirements

### R1. Bộ lọc điều hướng phân quyền thông minh (Role-Aware Redirect Guard)
- Tại trang `Deploy-Docker/CNPM-BrewLite/apps/frontend/src/app/login/page.tsx` (trên máy chủ EC2 `13.212.123.26` và local repo nếu có), xây dựng hàm kiểm tra thẩm quyền của tài khoản (Role) trước khi thực thi chuyển hướng theo tham số `redirect`:
  - Nếu tài khoản có vai trò `CUSTOMER` nhưng tham số `redirect` trỏ vào route nội bộ của nhân viên/quản trị (`/staff` hoặc `/admin`), hệ thống tự động bỏ qua redirect nội bộ đó và chuyển hướng khách hàng về Trang chủ (`/`), ngăn chặn hoàn toàn việc bị đá văng ngược lại trang login hoặc rơi vào vòng lặp 403.
  - Nếu tài khoản là `STAFF` hoặc `ADMIN`, chuyển hướng chính xác vào trang làm việc tương ứng (`/staff` hoặc `/admin`).
  - Nếu tài khoản là `CUSTOMER` và `redirect` trỏ vào các trang khách hàng hợp lệ (như `/checkout`, `/orders/history`, `/profile`), cho phép chuyển tiếp bình thường.

### R2. Chuẩn hóa hành vi Đăng xuất (Clean Logout)
- Tại `Deploy-Docker/CNPM-BrewLite/apps/frontend/src/app/staff/page.tsx`, sửa hàm `handleLogout` để khi nhân viên chủ động đăng xuất, hệ thống điều hướng sạch về `/login` (không gắn cứng tham số `?redirect=/staff`) hoặc về trang chủ `/`.
- Đảm bảo phiên làm việc (session/token) của các vai trò được dọn sạch hoàn toàn, không lưu vết gây nhiễu cho lần đăng nhập kế tiếp.

### R3. Chuẩn hóa trợ năng (Accessibility - a11y Compliance theo web.dev)
- Khắc phục lỗi Form inputs mồ côi (orphaned inputs): Gắn thẻ `<label htmlFor="login-email">` với `<input id="login-email">` và `<label htmlFor="login-password">` với `<input id="login-password">`.
- Bổ sung `role="alert"` và `aria-live="assertive"` cho banner thông báo lỗi đăng nhập để trình đọc màn hình thông báo tức thì cho người khiếm thị.
- Giữ nguyên trạng thái hỗ trợ bàn phím, độ tương phản màu sắc và kích thước mục bấm tối thiểu (tap target >= 48px) theo chuẩn web.dev.

### R4. Build & Hot-deploy an toàn lên Container EC2
- Kiểm tra cú pháp TypeScript/Next.js, build lại container `brewlite_frontend` và cập nhật an toàn trên EC2 `13.212.123.26` (SSH key: `e:\QuanTriMang\Deploy-Docker\calculator-key.pem`, user `ubuntu`) mà không làm gián đoạn CSDL Postgres hay Nginx Reverse Proxy.
- Giữ nguyên chi phí 0 VNĐ (Free Tier).

## Verification Plan & Resources

### Programmatic Verification
1. **Kiểm tra luồng đăng nhập Customer qua link staff redirect:**
   - Thực hiện kiểm tra đăng nhập bằng tài khoản `customer@brewlite.vn` khi URL có `?redirect=/staff`.
   - Xác nhận chuyển hướng về `/` (HTTP 200 / DOM Trang chủ) thay vì `/staff` (Forbidden).
2. **Kiểm tra luồng đăng nhập Staff:**
   - Đăng nhập bằng `staff@brewlite.vn`, xác nhận chuyển tiếp chính xác vào `/staff`.
3. **Kiểm tra luồng Đăng xuất Staff:**
   - Nhấn Đăng xuất tại `/staff`, xác nhận URL đích là `/login` không còn query param `?redirect=/staff`.
4. **Kiểm tra Accessibility:**
   - Chạy kiểm tra DOM trên trang `/login`: Xác nhận mọi `<input>` đều có `<label>` liên kết bằng `id`/`htmlFor` hợp lệ.

## Acceptance Criteria

### Core Deliverables
- [ ] Khách hàng đăng nhập từ URL `http://13.212.123.26/login?redirect=/staff` được đưa vào Trang chủ `/` mượt mà, không bị kẹt ở trang login.
- [ ] Nhân viên Barista đăng nhập vào `/staff` thành công.
- [ ] Nút Đăng xuất ở `/staff` không còn đính kèm `?redirect=/staff`.
- [ ] Toàn bộ input trên trang `/login` có liên kết `htmlFor` và `id` chuẩn a11y.
- [ ] Container `brewlite_frontend` chạy ổn định trên EC2 với trạng thái healthy.
