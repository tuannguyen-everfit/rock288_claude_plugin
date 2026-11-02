# Research Report: Claude Code thiết kế app điện thoại vào Figma

Ngày: 2026-10-19 15:37 (Asia/Saigon)

## Executive Summary

**Có.** Claude Code thiết kế được màn hình app mobile và vẽ thẳng lên Figma qua **Figma MCP server chính chủ** (remote, `https://mcp.figma.com/mcp`). Tool chính là `use_figma` ("write to canvas"): nó tạo frame, auto-layout, text và component thật trong Figma, không phải ảnh dán vào. Session hiện tại **đã kết nối sẵn** Figma connector (`mcp__claude_ai_Figma__use_figma`, `create_new_file`, `search_design_system`, `get_screenshot`...), nên dùng được luôn, không cần setup thêm.

Thực tế:
- Wireframe, mockup, flow nhiều màn hình, component library cơ bản: làm tốt.
- Hiện là **beta**, kết quả thường phải chỉnh tay. Chất lượng phụ thuộc lớn vào việc có design system (components/variables) cho nó reuse hay không.
- Ra layer phẳng, fixed-width (vd 390px), không tự responsive, không tự tạo prototype/interaction trừ khi yêu cầu cụ thể.
- Không thay được designer về product sense hay brand. Coi nó như junior designer làm draft nhanh.

## Research Methodology
- Sources: ~10 (Figma developer docs, Figma help center, blog thực nghiệm)
- Search terms: "Figma MCP use_figma write to canvas", "Claude Code Figma mobile app from scratch", "generate_figma_design code to canvas"
- Kiểm tra thêm: danh sách tool Figma MCP đang có trong session

## Key Findings

### 1. Hai con đường đưa design vào Figma

| | `use_figma` (write to canvas) | `generate_figma_design` (code to canvas) |
|---|---|---|
| Input | Prompt / ý tưởng / design system | **Web UI đang chạy** trên browser |
| Output | Layer Figma-native: auto-layout, component, variable | Frame editable nhưng phẳng, không link library |
| Dùng cho mobile native (iOS/Android/Flutter/RN) | ✅ cách chính | ❌ chỉ capture được web |
| Trạng thái | Beta, đang free, sau này tính phí theo usage | GA trên remote server |

→ Với app điện thoại: dùng **`use_figma`** (+ `search_design_system` để reuse component có sẵn). Hướng dẫn của Figma MCP ghi rõ: "For non-web targets (iOS, Android, generic UI), use use_figma with search_design_system."

### 2. Giới hạn theo loại seat Figma
- View / Collab seat: **~6 tool call/tháng**, gần như không dùng được.
- Dev / Full seat: hàng trăm call/ngày tùy plan.
- Mỗi màn hình phức tạp có thể tốn nhiều lần gọi `use_figma`, nên cần Full/Dev seat.

### 3. Chất lượng thực tế (theo các bài test bên thứ ba)
- Có design system thì output nhất quán. Không có thì nó tự chọn spacing/type scale, và vài setup còn hỏi lại thay vì đoán (sep.com).
- Mockup 390px: đúng về hình nhưng container fixed-width, không responsive (codeminer42).
- Làm literal "đúng những gì bạn yêu cầu, không hơn", nên prompt phải nêu rõ states, edge case, dark mode.
- Sửa qua lại giữa code và Figma vẫn tốn nhiều bước (builder.io).

## Implementation Recommendations

### Quick Start (dùng ngay trong session này)
1. Bảo Claude: *"Tạo file Figma mới, thiết kế 4 màn hình onboarding + home cho app X, iPhone 15 (393×852), style Y"*.
2. Claude sẽ: load skill `/figma-use` (bắt buộc trước `use_figma`), chạy `create_new_file` hoặc dùng file URL bạn đưa, rồi `search_design_system` (nếu team có library), `use_figma` để dựng frame và component, cuối cùng `get_screenshot` để tự review và sửa.
3. Mở link Figma, chỉnh tay phần cần.

Setup ở máy/project khác:
```bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
# lần đầu dùng sẽ mở OAuth Figma trên browser
```
Hoặc cài Figma plugin từ marketplace chính thức của Anthropic, có kèm sẵn các skill `/figma-use`, `/figma-generate-design`.

### Prompt tips
- Nêu device frame và kích thước, platform (iOS HIG / Material 3).
- Đưa design system hoặc file Figma library có sẵn để nó reuse component thay vì vẽ từ đầu.
- Liệt kê đủ màn hình và states (empty / loading / error), mỗi lần làm 1–3 màn hình.
- Yêu cầu dùng auto-layout và variables (màu, spacing) để file dễ sửa.

### Common Pitfalls
- Seat View/Collab: hết quota sau vài call.
- Prompt một lần cả app 20 màn hình: dễ lỗi, tốn quota. Nên chia nhỏ.
- Mong ra prototype có interaction đầy đủ: không thực tế, phải yêu cầu riêng hoặc làm tay.
- Nhầm `generate_figma_design` dùng được cho app native: nó chỉ capture web.

## Workflow thay thế (nếu cần pixel-perfect hơn)
```
Claude Code dựng UI bằng code (web / React Native Web / Flutter web)
        → chạy local
        → generate_figma_design capture vào Figma
        → designer chỉnh
```
Hợp khi muốn design bám sát code thật. Đổi lại, layer phẳng và không link library.

## Resources
- [Figma MCP: Write to canvas](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas)
- [Figma MCP: Code to canvas](https://developers.figma.com/docs/figma-mcp-server/code-to-canvas/)
- [Guide to the Figma MCP server (help center)](https://help.figma.com/hc/en-us/articles/32132100833559)
- [SEP: Claude + Figma Console MCP designed an app from scratch](https://sep.com/blog/claude-figma-console-mcp-designed-an-app-from-scratch/)
- [Codeminer42: Figma MCP builds exactly what you ask](https://blog.codeminer42.com/figma-mcp-builds-exactly-what-you-ask-nothing-more/)
- [Builder.io: Figma remote MCP](https://www.builder.io/blog/figma-remote-mcp)
- [ADPList: Claude Code x Figma MCP designer's playbook](https://adplist.substack.com/p/how-to-build-with-figma-mcp-the-designers)

## Next Steps
1. Kiểm tra loại seat Figma của bạn (cần Full hoặc Dev).
2. Chọn: có design system/library team không? Có thì đưa URL file library.
3. Thử 1 flow nhỏ (vd login + home) trong session này để đánh giá chất lượng trước khi làm cả app.

## Unresolved Questions
- Giá `use_figma` sau beta chưa công bố.
- Quota chính xác cho Dev/Full seat theo từng plan cần xem trang pricing Figma hiện hành.
- Seat Figma Everfit đang dùng (chưa biết).
