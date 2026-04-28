# Mijenro OS

Mijenro 内部 ERP — 服装外贸全链路（接单 → 生产 → 出运）操作系统。

> 起源：从 `order-converter`（AI PO 解析工具）演进而来。

## Stack

- Next.js 16 (App Router) + React 19
- PostgreSQL + Drizzle ORM
- AI 提取：Google Gemini + MiniMax fallback
- 部署：Zeabur (Tokyo HND1)

## 本地开发

```bash
npm install
cp .env.example .env.local   # 或从 macOS Keychain 取出 (security find-generic-password -s order-converter-env -w | xxd -r -p)
npm run dev                   # http://localhost:3000
```

## 模块（规划中）

| 模块 | 路径 | 状态 |
|---|---|---|
| 接单 / PO 解析 | `app/(orders)/` | ✅ 已上线 |
| 供应商管理 | `app/dashboard/vendors/` | ✅ 已上线 |
| 生产管理 (VPO / 工单) | `app/(production)/` | 🚧 规划 |
| 出运管理 (单据 / 物流) | `app/(shipping)/` | 🚧 规划 |
| 财务 / 关税 | `app/dashboard/finance/`, `app/dashboard/tariffs/` | 🟡 部分 |

## 测试

```bash
npm run test       # vitest run
npm run test:ui    # vitest --ui
```
