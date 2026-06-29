---
description: "واجهات REST و WebSocket — بروتوكول MTF-native، مدعوم بالسلسلة."
---

# مرجع الـ API

بروتوكول واحد أصلي لـ MTF، تخدمه نقطة دخول البوابة
(`https://<net>-gateway.mtf.exchange`).

| السطح | الموقع | ملاحظات |
|--------|-------|----------|
| **MTF-native** | `POST /exchange`، `POST /info`، `GET /ws`، `POST /faucet` | بنية مدمجة بصيغة snake_case. تعرض كل الإمكانيات، بما فيها ميزات MTF المتقدمة (RFQ، FBA، تسجيل PM، التكامل متعدد السلاسل). |

> البوابة هي نقطة الدخول للسطح الأصلي لـ MTF
> (`/info`، `/exchange`، `/ws`). هل تشغّل العقدة بنفسك؟ تُقدّم نفس
> الواجهة الأصلية مباشرةً على `http://localhost:8080`.

## REST

- [`POST /exchange`](./rest/exchange.md) — MTF-native؛ قائمة الإجراءات الكاملة
- [`POST /info`](./rest/info.md) — MTF-native؛ مخططات لكل نوع

## WebSocket

- [بروتوكول WS](./ws/index.md) — دورة حياة الاتصال، الإطارات، المصادقة، الاستئناف
- [الاشتراكات](./ws/subscriptions.md) — قائمة القنوات الكاملة

## مشتركة عبر الواجهات

- [الأخطاء](./errors.md) — قائمة أخطاء شاملة مع خطوات المعالجة
- [حدود الطلبات](./rate-limits.md) — ميزانيات الوزن لكل IP وحصة QPS لكل حساب

## انظر أيضاً

- [دليل التكامل السريع](../integration/quickstart.md) — تكامل كامل في 5 دقائق
- [شرح التوقيع](../integration/signing.md) — غلاف EIP-712
- [الشبكات](../networks.md) — نقاط النهاية لكل شبكة
