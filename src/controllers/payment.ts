import { stripe } from "../app.js";
import { TryCatch } from "../middlewares/error.js";
import { Coupon } from "../models/coupon.js";
import { Product } from "../models/product.js";
import { User } from "../models/user.js";
import { OrderItemType, ShippingInfoType } from "../types/types.js";
import ErrorHandler from "../utils/utility-class.js";

// Helper function to calculate payment details
const calculatePayment = (items: OrderItemType[], products: any[], discountAmount: number) => {
  const subtotal = products.reduce((prev, curr) => {
    const item = items.find((i) => i.productId === curr._id.toString());
    return item ? prev + curr.price * item.quantity : prev;
  }, 0);

  const tax = subtotal * 0.18;
  const shipping = subtotal > 1000 ? 0 : 200;
  const total = Math.max(0, Math.floor(subtotal + tax + shipping - discountAmount));

  return { subtotal, tax, shipping, total };
};

export const createPaymentIntent = TryCatch(async (req, res, next) => {
  const { id } = req.query;
  const { items, shippingInfo, coupon }: { items: OrderItemType[]; shippingInfo: ShippingInfoType; coupon?: string } = req.body;

  if (!items?.length) return next(new ErrorHandler("Please send items", 400));
  if (!shippingInfo) return next(new ErrorHandler("Please send shipping info", 400));

  const [user, discount] = await Promise.all([
    User.findById(id).select("name"),
    coupon ? Coupon.findOne({ code: coupon }) : null
  ]);

  if (!user) return next(new ErrorHandler("Please login first", 401));
  if (coupon && !discount) return next(new ErrorHandler("Invalid Coupon Code", 400));

  const discountAmount = discount?.amount || 0;
  const productIDs = items.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIDs } });

  if (products.length !== items.length)
    return next(new ErrorHandler("One or more products are invalid or unavailable", 400));

  const { subtotal, tax, shipping, total } = calculatePayment(items, products, discountAmount);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: total * 100,
    currency: "inr",
    description: "MERN-Ecommerce",
    shipping: {
      name: user.name,
      address: {
        line1: shippingInfo.address,
        postal_code: shippingInfo.pinCode.toString(),
        city: shippingInfo.city,
        state: shippingInfo.state,
        country: shippingInfo.country,
      },
    },
  });

  return res.status(201).json({
    success: true,
    clientSecret: paymentIntent.client_secret,
  });
});

export const newCoupon = TryCatch(async (req, res, next) => {
  const { code, amount } = req.body;

  if (!code || !amount) return next(new ErrorHandler("Please enter both coupon and amount", 400));

  const existingCoupon = await Coupon.findOne({ code: { $regex: new RegExp(`^${code}$`, "i") } });
  if (existingCoupon) return next(new ErrorHandler("Coupon code already exists", 400));

  await Coupon.create({ code, amount });

  return res.status(201).json({
    success: true,
    message: `Coupon ${code} Created Successfully`,
  });
});

export const applyDiscount = TryCatch(async (req, res, next) => {
  const { coupon } = req.query;

  const discount = await Coupon.findOne({ code: coupon });

  if (!discount) return next(new ErrorHandler("Invalid Coupon Code", 400));

  return res.status(200).json({
    success: true,
    discount: discount.amount,
  });
});

export const allCoupons = TryCatch(async (req, res, next) => {
  const coupons = await Coupon.find({});
  return res.status(200).json({ success: true, coupons });
});

export const getCoupon = TryCatch(async (req, res, next) => {
  const { id } = req.params;

  const coupon = await Coupon.findById(id);
  if (!coupon) return next(new ErrorHandler("Invalid Coupon ID", 400));

  return res.status(200).json({ success: true, coupon });
});

export const updateCoupon = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const { code, amount } = req.body;

  if (!code && !amount) return next(new ErrorHandler("Please provide fields to update", 400));

  const coupon = await Coupon.findById(id);
  if (!coupon) return next(new ErrorHandler("Invalid Coupon ID", 400));

  if (code) coupon.code = code;
  if (amount) coupon.amount = amount;

  await coupon.save();

  return res.status(200).json({
    success: true,
    message: `Coupon ${coupon.code} Updated Successfully`,
  });
});

export const deleteCoupon = TryCatch(async (req, res, next) => {
  const { id } = req.params;

  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) return next(new ErrorHandler("Invalid Coupon ID", 400));

  return res.status(200).json({
    success: true,
    message: `Coupon ${coupon.code} Deleted Successfully`,
  });
});
