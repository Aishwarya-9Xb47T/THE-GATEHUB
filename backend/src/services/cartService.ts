import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { getPlatformSettings } from "./platformSettingsService.js";
import { validateCouponForCart } from "./couponService.js";
import { resolveProductSalePrice } from "./productCatalogService.js";
import { razorpay } from "./razorpayService.js";

function orderNumber(): string {
  return `GH-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function getOrCreateCart(userId: string) {
  return prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: {
      items: {
        include: {
          product: {
            include: {
              course: { select: { id: true, title: true, thumbnail: true, status: true } },
              learningUniverse: { select: { id: true, title: true, thumbnail: true, status: true } },
            },
          },
        },
      },
    },
  });
}

async function userOwnsProduct(userId: string, product: {
  courseId?: string | null;
  learningUniverseId?: string | null;
  productType: string;
}): Promise<boolean> {
  if (product.courseId) {
    const paid = await prisma.payment.findFirst({
      where: { userId, courseId: product.courseId, status: "completed" },
    });
    if (paid) return true;
    const enrolled = await prisma.enrollment.findFirst({
      where: { userId, courseId: product.courseId },
    });
    return !!enrolled;
  }
  if (product.learningUniverseId) {
    const paid = await prisma.payment.findFirst({
      where: { userId, learningUniverseId: product.learningUniverseId, status: "completed" },
    });
    if (paid) return true;
    const enrolled = await prisma.learningUniverseEnrollment.findFirst({
      where: { userId, learningUniverseId: product.learningUniverseId },
    });
    return !!enrolled;
  }
  return false;
}

export async function getCart(userId: string) {
  const cart = await getOrCreateCart(userId);
  const settings = await getPlatformSettings();
  const platformFeePct = settings.platformFeePercentage ?? 20;

  let subtotal = 0;
  const items = [];
  for (const item of cart.items) {
    const p = item.product;
    if (!p.published || !p.visible) continue;
    const unitPrice = resolveProductSalePrice(p);
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    const owned = await userOwnsProduct(userId, p);
    items.push({
      id: item.id,
      productId: p.id,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      owned,
      product: {
        id: p.id,
        productType: p.productType,
        displayName: p.displayName,
        thumbnail: p.thumbnail,
        courseId: p.courseId,
        learningUniverseId: p.learningUniverseId,
      },
    });
  }

  const gstPercent = settings.commerceGstPercentage ?? 0;
  const taxAmount = Math.round(subtotal * (gstPercent / 100) * 100) / 100;
  const platformFee = Math.round(subtotal * (platformFeePct / 100) * 100) / 100;

  return {
    items,
    subtotal,
    discountAmount: 0,
    taxAmount,
    platformFee,
    grandTotal: Math.round((subtotal + taxAmount) * 100) / 100,
    currency: settings.defaultCurrency || "INR",
    gstPercent,
  };
}

export async function addToCart(userId: string, productId: string, quantity = 1) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.published) throw new AppError(404, "Product not available");
  if (product.price <= 0) throw new AppError(400, "Free products cannot be added to cart");

  const owned = await userOwnsProduct(userId, product);
  if (owned) throw new AppError(400, "You already own this product");

  const cart = await prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const qty = product.productType === "bundle" ? Math.max(1, quantity) : 1;

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    create: { cartId: cart.id, productId, quantity: qty },
    update: { quantity: qty },
  });

  return getCart(userId);
}

export async function removeFromCart(userId: string, productId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) return getCart(userId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
  return getCart(userId);
}

export async function updateCartQuantity(userId: string, productId: string, quantity: number) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(404, "Product not found");
  if (product.productType !== "bundle") {
    throw new AppError(400, "Quantity can only be updated for bundles");
  }
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) throw new AppError(404, "Cart not found");
  if (quantity < 1) return removeFromCart(userId, productId);
  await prisma.cartItem.updateMany({
    where: { cartId: cart.id, productId },
    data: { quantity },
  });
  return getCart(userId);
}

export async function moveCartItemToWishlist(userId: string, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(404, "Product not found");

  await removeFromCart(userId, productId);

  const data: {
    userId: string;
    productId: string;
    courseId?: string;
    learningUniverseId?: string;
  } = { userId, productId };
  if (product.courseId) data.courseId = product.courseId;
  if (product.learningUniverseId) data.learningUniverseId = product.learningUniverseId;

  await prisma.wishlistItem.upsert({
    where: product.courseId
      ? { userId_courseId: { userId, courseId: product.courseId } }
      : product.learningUniverseId
        ? { userId_learningUniverseId: { userId, learningUniverseId: product.learningUniverseId } }
        : { userId_productId: { userId, productId } },
    create: data,
    update: {},
  });

  return getCart(userId);
}

export async function buildCartCheckoutPreview(userId: string, couponCode?: string) {
  const cart = await getCart(userId);
  const purchasable = cart.items.filter((i) => !i.owned);
  if (purchasable.length === 0) throw new AppError(400, "Cart is empty or all items already owned");

  const subtotal = purchasable.reduce((s, i) => s + i.lineTotal, 0);
  let discountAmount = 0;
  let appliedCoupon: string | null = null;

  if (couponCode?.trim()) {
    const coupon = await validateCouponForCart(couponCode, userId, purchasable, subtotal);
    discountAmount = coupon.discountAmount;
    appliedCoupon = coupon.code;
  }

  const settings = await getPlatformSettings();
  const taxable = Math.max(0, subtotal - discountAmount);
  const gstPercent = settings.commerceGstPercentage ?? 0;
  const taxAmount = Math.round(taxable * (gstPercent / 100) * 100) / 100;
  const platformFeePct = settings.platformFeePercentage ?? 20;
  const platformFee = Math.round(taxable * (platformFeePct / 100) * 100) / 100;
  const grandTotal = Math.round((taxable + taxAmount) * 100) / 100;

  return {
    ...cart,
    items: purchasable,
    subtotal,
    discountAmount,
    taxAmount,
    platformFee,
    grandTotal,
    couponCode: appliedCoupon,
    gstPercent,
  };
}

export async function createCartOrder(userId: string, couponCode?: string) {
  const preview = await buildCartCheckoutPreview(userId, couponCode);
  const amountPaise = Math.round(preview.grandTotal * 100);
  if (amountPaise < 100) throw new AppError(400, "Order total must be at least ₹1");

  const firstItem = preview.items[0];
  const product = await prisma.product.findUnique({ where: { id: firstItem.productId } });
  if (!product) throw new AppError(404, "Product not found");

  const notes: Record<string, string> = { userId, orderKind: "cart", itemCount: String(preview.items.length) };
  if (preview.couponCode) notes.couponCode = preview.couponCode;

  const razorpayOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: preview.currency,
    receipt: `cart_${Date.now()}`,
    notes,
  });

  const title =
    preview.items.length === 1
      ? firstItem.product.displayName
      : `${preview.items.length} items`;

  const order = await prisma.order.create({
    data: {
      orderNumber: orderNumber(),
      userId,
      orderKind: "cart",
      productType: preview.items.length === 1 ? product.productType : "cart",
      productTitle: title,
      instructorId: product.instructorId,
      subtotal: preview.subtotal,
      discountAmount: preview.discountAmount,
      taxAmount: preview.taxAmount,
      totalAmount: preview.grandTotal,
      currency: preview.currency,
      couponCode: preview.couponCode,
      status: "pending",
      razorpayOrderId: razorpayOrder.id,
      items: {
        create: preview.items.map((item) => ({
          productId: item.productId,
          productType: item.product.productType,
          productTitle: item.product.displayName,
          courseId: item.product.courseId,
          learningUniverseId: item.product.learningUniverseId,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
      },
    },
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      userId,
      productType: order.productType,
      amount: preview.grandTotal,
      subtotal: preview.subtotal,
      discountAmount: preview.discountAmount,
      taxAmount: preview.taxAmount,
      couponCode: preview.couponCode,
      currency: preview.currency,
      status: "pending",
      razorpayOrderId: razorpayOrder.id,
      instructorId: product.instructorId,
      gateway: "razorpay",
    },
  });

  return {
    orderId: razorpayOrder.id,
    internalOrderId: order.id,
    orderNumber: order.orderNumber,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    title,
    totalAmount: preview.grandTotal,
  };
}

export async function clearCartAfterPurchase(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) return;
  const productIds = order.items.map((i) => i.productId).filter(Boolean) as string[];
  if (productIds.length) {
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productId: { in: productIds } },
    });
  }
}
