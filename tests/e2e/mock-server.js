/**
 * CNPM-BrewLite Test Oracle Mock Server
 * Simulates Port 80 Nginx reverse proxy + NestJS API backend
 * Used for offline verification and local test suite validation
 */

const http = require('http');

class MockBrewLiteServer {
  constructor(port = 8089) {
    this.port = port;
    this.server = null;
    this.resetState();
  }

  resetState() {
    this.users = {
      'admin@brewlite.vn': { id: 'usr-admin-1', email: 'admin@brewlite.vn', password: 'Admin123!', role: 'ADMIN', loyaltyPoints: 100 },
      'staff@brewlite.vn': { id: 'usr-staff-1', email: 'staff@brewlite.vn', password: 'Staff123!', role: 'STAFF', loyaltyPoints: 0 },
      'customer@brewlite.vn': { id: 'usr-customer-1', email: 'customer@brewlite.vn', password: 'Customer123!', role: 'CUSTOMER', loyaltyPoints: 50 },
    };

    this.tokens = {
      'mock-admin-token': this.users['admin@brewlite.vn'],
      'mock-staff-token': this.users['staff@brewlite.vn'],
      'mock-customer-token': this.users['customer@brewlite.vn'],
    };

    this.products = [
      { id: 'prod-1', name: 'Cà phê Sữa Đá Sài Gòn', price: 35000, stock: 100, version: 1, inStock: true, description: 'Đậm đà Robusta', imageUrl: 'http://img.test/1.jpg' },
      { id: 'prod-2', name: 'Americano Cổ Điển', price: 40000, stock: 100, version: 1, inStock: true, description: 'Espresso nguyên chất', imageUrl: 'http://img.test/2.jpg' },
      { id: 'prod-3', name: 'Cappuccino Bọt Sữa Mịn', price: 45000, stock: 100, version: 1, inStock: true, description: 'Cân bằng hoàn hảo', imageUrl: 'http://img.test/3.jpg' },
      { id: 'prod-4', name: 'Trà Đào Cam Sả Tươi', price: 42000, stock: 100, version: 1, inStock: true, description: 'Trà đen thanh mát', imageUrl: 'http://img.test/4.jpg' },
      { id: 'prod-5', name: 'Bạc Xỉu Sữa Tươi Kem Béo', price: 39000, stock: 100, version: 1, inStock: true, description: 'Nhiều sữa ít cà phê', imageUrl: 'http://img.test/5.jpg' },
      { id: 'prod-6', name: 'Trà Sữa Oolong Nướng', price: 48000, stock: 100, version: 1, inStock: true, description: 'Cốt sữa thơm lừng', imageUrl: 'http://img.test/6.jpg' },
      { id: 'prod-7', name: 'Cà phê Giới hạn (Limited Cold Brew)', price: 55000, stock: 1, version: 1, inStock: true, description: 'Ủ lạnh 24 giờ', imageUrl: 'http://img.test/7.jpg' },
    ];

    this.options = {
      sizes: [
        { code: 'S', name: 'Size Nhỏ (S)', priceAdjustment: 0 },
        { code: 'M', name: 'Size Vừa (M)', priceAdjustment: 5000 },
        { code: 'L', name: 'Size Lớn (L)', priceAdjustment: 10000 },
      ],
      toppings: [
        { name: 'Trân châu trắng', price: 5000 },
        { name: 'Kem Cheese', price: 10000 },
        { name: 'Thạch cà phê', price: 5000 },
      ],
    };

    this.vouchers = {
      'WELCOME10': { code: 'WELCOME10', type: 'PERCENT', value: 10, minOrder: 50000, usageLimit: 100, usedCount: 0, expiresAt: null },
      'FIXED20K': { code: 'FIXED20K', type: 'FIXED', value: 20000, minOrder: 100000, usageLimit: 50, usedCount: 0, expiresAt: null },
    };

    this.redeemedVouchers = {}; // code -> { code, type: 'FIXED', value, minOrder, userId, used: false }

    this.orders = {}; // id -> order
    this.orderCodeSeq = 1000;
    this.payments = {}; // idempotencyKey -> paymentResponse
  }

  getUserFromAuth(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.slice(7);
    return this.tokens[token] || null;
  }

  async start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, () => {
        resolve(`http://localhost:${this.port}`);
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  sendJson(res, statusCode, body) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  sendHtml(res, statusCode, html) {
    res.writeHead(statusCode, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  async getBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://localhost:${this.port}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Static Frontend routes
    if (pathname === '/') {
      return this.sendHtml(res, 200, '<!DOCTYPE html><html><head><title>BrewLite - Cà Phê Thông Minh</title></head><body><div id="__next">Storefront</div></body></html>');
    }
    if (pathname === '/staff') {
      return this.sendHtml(res, 200, '<!DOCTYPE html><html><head><title>BrewLite - Barista KDS</title></head><body>KDS Board</body></html>');
    }
    if (pathname === '/admin') {
      return this.sendHtml(res, 200, '<!DOCTYPE html><html><head><title>BrewLite - Admin Portal</title></head><body>Admin Portal</body></html>');
    }
    if (pathname === '/login') {
      return this.sendHtml(res, 200, '<!DOCTYPE html><html><head><title>BrewLite - Đăng nhập</title></head><body>Login Page</body></html>');
    }

    // System routes
    if (pathname === '/api' && method === 'GET') {
      return this.sendJson(res, 200, {
        name: 'BrewLite API',
        version: '1.0.0',
        description: 'Cashless Coffee Ordering System REST API',
        status: 'online',
      });
    }

    if (pathname === '/api/health' && method === 'GET') {
      return this.sendJson(res, 200, {
        status: 'ok',
        service: 'brewlite-backend',
        timestamp: new Date().toISOString(),
        uptime: 42,
      });
    }

    // Auth routes
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await this.getBody(req);
      const user = this.users[body.email];
      if (!user || user.password !== body.password) {
        return this.sendJson(res, 401, { statusCode: 401, message: 'Sai email hoặc mật khẩu' });
      }
      const token = `mock-${user.role.toLowerCase()}-token-${Date.now()}`;
      this.tokens[token] = user;
      return this.sendJson(res, 200, {
        message: 'Đăng nhập thành công',
        accessToken: token,
        user: { id: user.id, email: user.email, role: user.role, loyaltyPoints: user.loyaltyPoints },
      });
    }

    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = await this.getBody(req);
      if (!body.email || !body.password) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Email và mật khẩu không được để trống' });
      }
      if (body.password.length < 6) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
      }
      if (this.users[body.email]) {
        return this.sendJson(res, 409, { statusCode: 409, message: 'Email đã tồn tại trong hệ thống' });
      }
      const newUser = {
        id: `usr-${Date.now()}`,
        email: body.email,
        password: body.password,
        role: 'CUSTOMER',
        loyaltyPoints: 0,
      };
      this.users[body.email] = newUser;
      const token = `mock-customer-token-${Date.now()}`;
      this.tokens[token] = newUser;
      return this.sendJson(res, 201, {
        message: 'Đăng ký tài khoản thành công',
        accessToken: token,
        user: { id: newUser.id, email: newUser.email, role: newUser.role, loyaltyPoints: newUser.loyaltyPoints },
      });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });
      return this.sendJson(res, 200, { id: user.id, email: user.email, role: user.role, loyaltyPoints: user.loyaltyPoints });
    }

    // Products routes
    if (pathname === '/api/products' && method === 'GET') {
      return this.sendJson(res, 200, {
        items: this.products.map(p => ({ ...p, inStock: p.stock > 0 })),
        options: this.options,
      });
    }

    if (pathname.startsWith('/api/products/') && pathname !== '/api/products/sync-inventory') {
      const id = pathname.replace('/api/products/', '');
      const product = this.products.find(p => p.id === id);

      if (method === 'GET') {
        if (!product) return this.sendJson(res, 404, { statusCode: 404, message: 'Không tìm thấy sản phẩm' });
        return this.sendJson(res, 200, { ...product, inStock: product.stock > 0, options: this.options });
      }

      if (method === 'PATCH') {
        const user = this.getUserFromAuth(req);
        if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });
        if (user.role !== 'ADMIN') return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });
        if (!product) return this.sendJson(res, 404, { statusCode: 404, message: 'Không tìm thấy sản phẩm' });

        const body = await this.getBody(req);
        if (body.stock !== undefined && body.stock < 0) {
          return this.sendJson(res, 400, { statusCode: 400, message: 'Tồn kho không được âm' });
        }
        if (body.name !== undefined) product.name = body.name;
        if (body.price !== undefined) product.price = body.price;
        if (body.stock !== undefined) product.stock = body.stock;
        product.version = (product.version || 1) + 1;
        return this.sendJson(res, 200, product);
      }

      if (method === 'DELETE') {
        const user = this.getUserFromAuth(req);
        if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });
        if (user.role !== 'ADMIN') return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });
        if (!product) return this.sendJson(res, 404, { statusCode: 404, message: 'Không tìm thấy sản phẩm' });

        // Guardrail: check if any order contains this product
        const hasOrders = Object.values(this.orders).some(o => o.items.some(it => it.productId === id));
        if (hasOrders) {
          return this.sendJson(res, 400, { statusCode: 400, message: `Không thể xóa món ${product.name} vì đã có đơn hàng liên quan trong hệ thống` });
        }

        this.products = this.products.filter(p => p.id !== id);
        return this.sendJson(res, 200, { success: true, message: 'Đã xóa sản phẩm thành công' });
      }
    }

    if (pathname === '/api/products' && method === 'POST') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });
      if (user.role !== 'ADMIN') return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });

      const body = await this.getBody(req);
      if (!body.name || body.price === undefined) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Tên và giá không được để trống' });
      }

      const newProd = {
        id: `prod-${Date.now()}`,
        name: body.name,
        price: body.price,
        stock: body.stock || 0,
        description: body.description || '',
        imageUrl: body.imageUrl || '',
        version: 1,
        inStock: (body.stock || 0) > 0,
      };
      this.products.push(newProd);
      return this.sendJson(res, 201, newProd);
    }

    if (pathname === '/api/products/sync-inventory' && method === 'POST') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });
      if (user.role !== 'ADMIN') return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });

      return this.sendJson(res, 200, {
        message: 'Đồng bộ tồn kho thành công',
        adjustedCount: 0,
        adjustedProducts: [],
      });
    }

    // Voucher routes
    if (pathname === '/api/vouchers/validate' && method === 'POST') {
      const body = await this.getBody(req);
      if (!body.code || typeof body.subtotal !== 'number') {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Vui lòng cung cấp mã giảm giá và tổng tiền' });
      }

      const user = this.getUserFromAuth(req);
      const voucher = this.vouchers[body.code] || this.redeemedVouchers[body.code];
      if (!voucher) {
        return this.sendJson(res, 404, { statusCode: 404, message: 'Mã giảm giá không tồn tại' });
      }

      // Check ownership if RW- voucher
      if (voucher.userId && (!user || user.id !== voucher.userId)) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Mã đổi thưởng này không thuộc về tài khoản của bạn' });
      }

      if (body.subtotal < voucher.minOrder) {
        return this.sendJson(res, 400, { statusCode: 400, message: `Mã giảm giá này chỉ áp dụng cho đơn hàng tối thiểu từ ${voucher.minOrder.toLocaleString('vi-VN')}đ` });
      }

      let discountAmount = 0;
      if (voucher.type === 'PERCENT') {
        discountAmount = Math.round((body.subtotal * voucher.value) / 100);
      } else {
        discountAmount = voucher.value;
      }

      return this.sendJson(res, 200, { valid: true, voucher, discountAmount });
    }

    if (pathname === '/api/vouchers/redeem' && method === 'POST') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });

      const body = await this.getBody(req);
      if (body.pointsCost !== 20 && body.pointsCost !== 50) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Gói đổi điểm phải là 20 hoặc 50 điểm' });
      }

      if (user.loyaltyPoints < body.pointsCost) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Không đủ điểm tích lũy để đổi voucher' });
      }

      user.loyaltyPoints -= body.pointsCost;
      const code = `RW-${user.id.slice(-4).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      const discountVal = body.pointsCost === 20 ? 15000 : 40000;
      const minOrder = body.pointsCost === 20 ? 40000 : 80000;

      const rwVoucher = {
        code,
        type: 'FIXED',
        value: discountVal,
        minOrder,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        used: false,
      };
      this.redeemedVouchers[code] = rwVoucher;

      return this.sendJson(res, 201, {
        voucher: rwVoucher,
        remainingPoints: user.loyaltyPoints,
      });
    }

    if (pathname === '/api/vouchers/my' && method === 'GET') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });

      const list = [
        ...Object.values(this.vouchers),
        ...Object.values(this.redeemedVouchers).filter(v => v.userId === user.id && !v.used),
      ];
      return this.sendJson(res, 200, list);
    }

    // Orders routes
    if (pathname === '/api/orders' && method === 'POST') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });

      const body = await this.getBody(req);
      if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Đơn hàng phải có ít nhất 1 món' });
      }

      for (const it of body.items) {
        if (!['S', 'M', 'L'].includes(it.size)) {
          return this.sendJson(res, 400, { statusCode: 400, message: 'Size không hợp lệ (chỉ chấp nhận S, M, L)' });
        }
        if (!it.qty || it.qty <= 0) {
          return this.sendJson(res, 400, { statusCode: 400, message: 'Số lượng tối thiểu là 1' });
        }
        const prod = this.products.find(p => p.id === it.productId);
        if (!prod) {
          return this.sendJson(res, 404, { statusCode: 404, message: `Không tìm thấy sản phẩm ${it.productId}` });
        }
        if (prod.stock < it.qty) {
          return this.sendJson(res, 409, { statusCode: 409, message: 'Sản phẩm đã có thay đổi tồn kho hoặc vừa hết hàng' });
        }
      }

      // Calculate totals
      let subtotal = 0;
      const orderItems = [];

      for (const it of body.items) {
        const prod = this.products.find(p => p.id === it.productId);
        prod.stock -= it.qty; // Reserve stock

        let unitPrice = prod.price;
        if (it.size === 'M') unitPrice += 5000;
        if (it.size === 'L') unitPrice += 10000;
        if (it.toppings) {
          for (const top of it.toppings) {
            const topDef = this.options.toppings.find(t => t.name === top);
            if (topDef) unitPrice += topDef.price;
          }
        }
        const itemTotal = unitPrice * it.qty;
        subtotal += itemTotal;
        orderItems.push({
          productId: prod.id,
          productName: prod.name,
          size: it.size,
          toppings: it.toppings || [],
          qty: it.qty,
          unitPrice,
          totalPrice: itemTotal,
        });
      }

      let discountAmount = 0;
      let appliedVoucherCode = null;

      if (body.voucherCode) {
        const voucher = this.vouchers[body.voucherCode] || this.redeemedVouchers[body.voucherCode];
        if (!voucher) {
          return this.sendJson(res, 400, { statusCode: 400, message: 'Mã voucher không hợp lệ' });
        }
        if (subtotal < voucher.minOrder) {
          return this.sendJson(res, 400, { statusCode: 400, message: 'Đơn hàng chưa đạt giá trị tối thiểu' });
        }
        if (voucher.type === 'PERCENT') {
          discountAmount = Math.round((subtotal * voucher.value) / 100);
        } else {
          discountAmount = voucher.value;
        }
        appliedVoucherCode = voucher.code;
      }

      const totalAmount = Math.max(0, subtotal - discountAmount);
      const orderId = `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const orderCode = `#${++this.orderCodeSeq}`;

      const order = {
        id: orderId,
        code: orderCode,
        userId: user.id,
        userEmail: user.email,
        status: 'PENDING',
        subtotal,
        discountAmount,
        totalAmount,
        voucherCode: appliedVoucherCode,
        items: orderItems,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      };

      this.orders[orderId] = order;
      return this.sendJson(res, 201, order);
    }

    if (pathname === '/api/orders/me' && method === 'GET') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });

      const userOrders = Object.values(this.orders).filter(o => o.userId === user.id);
      return this.sendJson(res, 200, userOrders);
    }

    if (pathname === '/api/orders/staff/active' && method === 'GET') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });
      if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
        return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });
      }

      const activeOrders = Object.values(this.orders).filter(o => ['PAID', 'PREPARING', 'READY'].includes(o.status));
      return this.sendJson(res, 200, activeOrders);
    }

    if (pathname.startsWith('/api/orders/') && !pathname.endsWith('/cancel') && !pathname.endsWith('/status')) {
      const orderId = pathname.replace('/api/orders/', '');
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });

      const order = this.orders[orderId];
      if (!order) return this.sendJson(res, 404, { statusCode: 404, message: 'Không tìm thấy đơn hàng' });

      if (user.role === 'CUSTOMER' && order.userId !== user.id) {
        return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });
      }
      return this.sendJson(res, 200, order);
    }

    if (pathname.match(/^\/api\/orders\/[^\/]+\/cancel$/) && method === 'POST') {
      const orderId = pathname.split('/')[3];
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });

      const order = this.orders[orderId];
      if (!order) return this.sendJson(res, 404, { statusCode: 404, message: 'Không tìm thấy đơn hàng' });

      if (user.role === 'CUSTOMER') {
        if (order.userId !== user.id) return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });
        if (order.status !== 'PENDING' && order.status !== 'PAYMENT_FAILED') {
          return this.sendJson(res, 400, { statusCode: 400, message: 'Khách hàng chỉ được hủy đơn khi chưa thanh toán' });
        }
      } else {
        if (order.status === 'PREPARING' || order.status === 'READY' || order.status === 'COMPLETED') {
          return this.sendJson(res, 400, { statusCode: 400, message: 'Chỉ được hủy đơn khi chưa bắt đầu pha chế' });
        }
      }

      // Restock items if not already restocked
      if (order.status !== 'PAYMENT_FAILED') {
        for (const it of order.items) {
          const prod = this.products.find(p => p.id === it.productId);
          if (prod) prod.stock += it.qty;
        }
      }

      order.status = 'CANCELLED';
      return this.sendJson(res, 200, order);
    }

    if (pathname.match(/^\/api\/orders\/[^\/]+\/status$/) && method === 'PATCH') {
      const orderId = pathname.split('/')[3];
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });
      if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
        return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });
      }

      const body = await this.getBody(req);
      const nextStatus = body.to;
      if (!nextStatus) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Vui lòng cung cấp trạng thái mới (to)' });
      }

      const order = this.orders[orderId];
      if (!order) return this.sendJson(res, 404, { statusCode: 404, message: 'Không tìm thấy đơn hàng' });

      const allowed = {
        'PAID': ['PREPARING'],
        'PREPARING': ['READY'],
        'READY': ['COMPLETED'],
      };

      if (!allowed[order.status] || !allowed[order.status].includes(nextStatus)) {
        return this.sendJson(res, 400, {
          statusCode: 400,
          message: `Chuyển đổi trạng thái không hợp lệ: Không thể chuyển từ ${order.status} sang ${nextStatus}`,
        });
      }

      order.status = nextStatus;
      return this.sendJson(res, 200, order);
    }

    // Payments routes
    if (pathname === '/api/payments' && method === 'POST') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });

      const idempotencyKey = req.headers['idempotency-key'];
      if (!idempotencyKey) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Bắt buộc phải có header [Idempotency-Key]' });
      }

      const body = await this.getBody(req);
      if (!body.orderId) {
        return this.sendJson(res, 400, { statusCode: 400, message: 'orderId không được để trống' });
      }

      // Check key collision across different orders
      if (this.payments[idempotencyKey]) {
        const prev = this.payments[idempotencyKey];
        if (prev.orderId !== body.orderId) {
          return this.sendJson(res, 422, {
            statusCode: 422,
            message: `Idempotency-Key ${idempotencyKey} đã được sử dụng cho một đơn hàng khác`,
          });
        }
        // Cached replay
        return this.sendJson(res, 200, { ...prev.response, idempotentReplay: true });
      }

      const order = this.orders[body.orderId];
      if (!order) return this.sendJson(res, 404, { statusCode: 404, message: 'Không tìm thấy đơn hàng' });

      if (order.userId !== user.id) {
        return this.sendJson(res, 403, { statusCode: 403, message: 'Không có quyền thanh toán cho đơn hàng này' });
      }

      if (order.status !== 'PENDING' && order.status !== 'PAYMENT_FAILED') {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Trạng thái đơn hàng không hợp lệ để thanh toán' });
      }

      if (body.forceFail) {
        order.status = 'PAYMENT_FAILED';
        // Restock
        for (const it of order.items) {
          const prod = this.products.find(p => p.id === it.productId);
          if (prod) prod.stock += it.qty;
        }

        const failRes = {
          status: 'FAILED',
          message: 'Thanh toán thất bại (Giả lập lỗi: Thẻ không đủ số dư)',
          orderId: order.id,
          code: order.code,
        };
        this.payments[idempotencyKey] = { orderId: order.id, response: failRes };
        return this.sendJson(res, 200, failRes);
      }

      // Successful payment
      order.status = 'PAID';
      const earnedPoints = Math.floor(order.totalAmount / 10000);
      user.loyaltyPoints = (user.loyaltyPoints || 0) + earnedPoints;

      const successRes = {
        status: 'PAID',
        message: 'Thanh toán thành công',
        orderId: order.id,
        code: order.code,
        loyaltyPointsEarned: earnedPoints,
      };
      this.payments[idempotencyKey] = { orderId: order.id, response: successRes };
      return this.sendJson(res, 200, successRes);
    }

    // Admin routes
    if (pathname === '/api/admin/users' && method === 'GET') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });
      if (user.role !== 'ADMIN') return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });

      return this.sendJson(res, 200, Object.values(this.users).map(u => ({ id: u.id, email: u.email, role: u.role, loyaltyPoints: u.loyaltyPoints })));
    }

    if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/role') && method === 'PATCH') {
      const user = this.getUserFromAuth(req);
      if (!user) return this.sendJson(res, 401, { statusCode: 401, message: 'Unauthorized' });
      if (user.role !== 'ADMIN') return this.sendJson(res, 403, { statusCode: 403, message: 'Forbidden' });

      const targetId = pathname.split('/')[4];
      const body = await this.getBody(req);

      if (targetId === user.id && body.role !== 'ADMIN') {
        return this.sendJson(res, 400, { statusCode: 400, message: 'Bạn không thể tự hạ quyền quản trị của chính mình' });
      }

      const targetUser = Object.values(this.users).find(u => u.id === targetId);
      if (!targetUser) return this.sendJson(res, 404, { statusCode: 404, message: 'Không tìm thấy người dùng' });

      targetUser.role = body.role;
      return this.sendJson(res, 200, { id: targetUser.id, email: targetUser.email, role: targetUser.role });
    }

    // Default fallback
    return this.sendJson(res, 404, { statusCode: 404, message: `Route not found: ${pathname}` });
  }
}

module.exports = { MockBrewLiteServer };
