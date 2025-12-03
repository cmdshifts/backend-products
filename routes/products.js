var express = require("express");
var router = express.Router();

let products = [];
let nextId = 1;

const ALLOWED_CATEGORIES = ["อาหาร", "เครื่องดื่ม", "ของใช้", "เสื้อผ้า"];

function validateProduct(data, isUpdate = false) {
	const errors = [];

	if (!data.name || data.name.trim() === "") {
		errors.push("ชื่อสินค้าต้องไม่ว่าง");
	}

	if (!data.sku || data.sku.trim() === "") {
		errors.push("รหัสสินค้าต้องไม่ว่าง");
	} else if (data.sku.length < 3) {
		errors.push("รหัสสินค้าต้องมีอย่างน้อย 3 ตัวอักษร");
	} else if (!isUpdate) {
		const existingSku = products.find((p) => p.sku === data.sku);
		if (existingSku) {
			errors.push("รหัสสินค้านี้มีอยู่ในระบบแล้ว");
		}
	}

	if (data.price === undefined || data.price === null) {
		errors.push("ราคาต้องไม่ว่าง");
	} else if (typeof data.price !== "number" || data.price <= 0) {
		errors.push("ราคาต้องมากกว่า 0");
	}

	if (data.stock === undefined || data.stock === null) {
		errors.push("จำนวนสต็อกต้องไม่ว่าง");
	} else if (typeof data.stock !== "number" || data.stock < 0) {
		errors.push("จำนวนสต็อกต้องไม่ติดลบ");
	}

	if (!data.category || data.category.trim() === "") {
		errors.push("หมวดหมู่ต้องไม่ว่าง");
	} else if (!ALLOWED_CATEGORIES.includes(data.category)) {
		errors.push(`หมวดหมู่ต้องเป็น 1 ใน: ${ALLOWED_CATEGORIES.join(", ")}`);
	}

	return errors;
}

router.post("/", function (req, res) {
	const errors = validateProduct(req.body);

	if (errors.length > 0) {
		return res.status(400).json({ errors });
	}

	const newProduct = {
		id: nextId++,
		name: req.body.name.trim(),
		sku: req.body.sku.trim(),
		price: req.body.price,
		stock: req.body.stock,
		category: req.body.category.trim(),
		createdAt: new Date().toISOString(),
	};

	products.push(newProduct);

	res.status(201).json(newProduct);
});

router.get("/", function (req, res) {
	const { category } = req.query;

	if (category) {
		if (!ALLOWED_CATEGORIES.includes(category)) {
			return res.status(400).json({
				error: `หมวดหมู่ไม่ถูกต้อง ต้องเป็น 1 ใน: ${ALLOWED_CATEGORIES.join(", ")}`,
			});
		}

		const filteredProducts = products.filter((p) => p.category === category);
		return res.json(filteredProducts);
	}

	res.json(products);
});

router.get("/search", function (req, res) {
	const { keyword } = req.query;

	if (!keyword || keyword.trim() === "") {
		return res.status(400).json({
			error: "กรุณาระบุคำค้นหา (keyword)",
		});
	}

	const searchKeyword = keyword.toLowerCase();

	const results = products.filter((p) => {
		const nameMatch = p.name.toLowerCase().includes(searchKeyword);
		const skuMatch = p.sku.toLowerCase().includes(searchKeyword);
		return nameMatch || skuMatch;
	});

	res.json(results);
});

router.post("/sell", function (req, res) {
	const { productId, quantity } = req.body;

	if (
		quantity === undefined ||
		quantity === null ||
		typeof quantity !== "number" ||
		quantity <= 0
	) {
		return res.status(400).json({
			error: "จำนวนสินค้าต้องมากกว่า 0",
		});
	}

	if (productId === undefined || productId === null) {
		return res.status(400).json({
			error: "กรุณาระบุ productId",
		});
	}

	const product = products.find((p) => p.id === productId);

	if (!product) {
		return res.status(404).json({
			error: "ไม่พบสินค้าในระบบ",
		});
	}

	if (product.stock < quantity) {
		return res.status(400).json({
			error: `สต็อกไม่เพียงพอ (มีเพียง ${product.stock} ชิ้น)`,
		});
	}

	product.stock -= quantity;

	res.json({
		message: "ขายสินค้าสำเร็จ",
		product: {
			id: product.id,
			name: product.name,
			sku: product.sku,
			remainingStock: product.stock,
		},
		soldQuantity: quantity,
	});
});

router.put("/bulk-price-update", function (req, res) {
	const { updates } = req.body;

	if (!updates || !Array.isArray(updates)) {
		return res.status(400).json({
			error: "กรุณาส่งข้อมูล updates เป็น array",
		});
	}

	if (updates.length === 0) {
		return res.status(400).json({
			error: "ข้อมูล updates ต้องมีอย่างน้อย 1 รายการ",
		});
	}

	const results = {
		success: [],
		failed: [],
	};

	updates.forEach((update, index) => {
		const { productId, newPrice } = update;

		if (productId === undefined || productId === null) {
			results.failed.push({
				index,
				productId,
				reason: "ไม่ระบุ productId",
			});
			return;
		}

		if (
			newPrice === undefined ||
			newPrice === null ||
			typeof newPrice !== "number" ||
			newPrice <= 0
		) {
			results.failed.push({
				index,
				productId,
				reason: "ราคาใหม่ต้องเป็นตัวเลขและมากกว่า 0",
			});
			return;
		}

		const product = products.find((p) => p.id === productId);

		if (!product) {
			results.failed.push({
				index,
				productId,
				reason: "ไม่พบสินค้าในระบบ",
			});
			return;
		}

		const oldPrice = product.price;
		product.price = newPrice;

		results.success.push({
			productId: product.id,
			name: product.name,
			sku: product.sku,
			oldPrice,
			newPrice,
		});
	});

	res.json({
		message: "อัพเดทราคาเสร็จสิ้น",
		summary: {
			total: updates.length,
			successCount: results.success.length,
			failedCount: results.failed.length,
		},
		results,
	});
});

router.get("/:id", function (req, res) {
	const product = products.find((p) => p.id === parseInt(req.params.id));

	if (!product) {
		return res.status(404).json({ error: "ไม่พบสินค้า" });
	}

	res.json(product);
});

module.exports = router;
