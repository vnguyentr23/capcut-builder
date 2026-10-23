# CapCut Compilation Builder

Ứng dụng desktop Windows với giao diện tiếng Việt, tối màu, để chọn và sắp xếp footage thành **dự án CapCut có thể chỉnh sửa**. Không render video cuối.

## Cài và chạy

Yêu cầu Windows 10/11 64-bit, Node.js 24 trở lên, npm, FFmpeg và ffprobe trong PATH. Bộ ghi dự án hiện dành cho CapCut 9.6 / draft schema 360000; phiên bản khác cần kiểm tra adapter trước.

```powershell
git clone https://github.com/vnguyentr23/capcut-builder.git
cd capcut-builder
npm ci
npm start
```

Hoặc chạy **Cai dat.cmd** một lần rồi **Khoi dong.cmd**. Repo không kèm Electron/FFmpeg dạng binary; Electron được tải khi cài npm, FFmpeg cần cài riêng.

## Sử dụng

1. Tạo ngách, chọn thư mục cha và đọc các nhóm con hoặc thêm nhóm thủ công.
2. Thiết lập Pattern, số footage mỗi block và số footage gốc tối đa.
3. Chọn Hook, Intro, video/ảnh kết thúc; tạo Body và chỉnh sửa footage nếu cần.
4. Chọn thư mục nhạc, gán nhạc; quét chuyển cảnh và hiệu ứng đã tải trong CapCut trên máy này.
5. Bấm **KIỂM TRA DỰ ÁN**. Lưu và đóng CapCut trước khi bấm **TẠO DỰ ÁN CAPCUT**.
6. Mở dự án trong CapCut để kiểm tra và tiếp tục chỉnh sửa. Tách lời/giữ lời do CapCut xử lý khi mở dự án; nghe trong tool vẫn là âm thanh gốc.

CapCut cần có ít nhất một dự án mẫu đã lưu để tool kiểm tra định dạng. Chế độ **Bản kế hoạch / manifest** có thể dùng để kiểm tra cấu trúc; đây không phải dự án CapCut hay video đã render.

## Tính năng

- Ngách có thiết lập, draft và lịch sử riêng; tự lưu bằng SQLite.
- Thư viện footage theo cột, tải thumbnail khi cần, phát video trực tiếp; có chế độ phóng to thư viện.
- Khóa vị trí; bật/tắt thứ tự ưu tiên clip khóa; chỉ lấy clip khóa theo từng cột.
- Random ưu tiên clip chưa xuất hiện trong 5 ô đầu, giữ vị trí khóa và vị trí cuộn.
- Dàn đều footage khi cột thiếu, tự bù từ nhóm khác; có thể tắt trong Thiết lập.
- Pattern độc lập với block; bù thêm một clip cho mỗi clip ngắn theo ngưỡng.
- Hook & Body hiển thị chung, hoán đổi footage giữa Hook và Body.
- Cắt footage trong modal, tùy chọn tiếng gốc/tắt tiếng/giữ lời/bỏ lời, credit theo footage.
- Một bài cho Hook, một bài mỗi block; kết thúc dùng chung nhạc block cuối. Nghe nhạc, đổi riêng bài, hoán đổi bài với Hook.
- Chuyển cảnh từ cache CapCut; hiệu ứng kết thúc có điểm cuối đúng cuối timeline.
- Xóa một clip hoặc toàn bộ danh sách đang lọc của cột: chỉ dự án hiện tại hoặc loại khỏi ngách. Không xóa file gốc.
- Body tránh footage đã dùng hoặc được giữ chỗ bởi draft khác trong cùng ngách; Hook được dùng lại với cảnh báo.

## Dữ liệu và sao lưu

- `data/`: SQLite, cache thumbnail và trạng thái ứng dụng.
- `Du an/`: các đầu ra của ứng dụng.
- Đóng tool trước khi sao lưu/chuyển `data/`. Chép media riêng, giữ đường dẫn hoặc liên kết lại trên máy mới. Dự án CapCut cũ cần chuyển cùng media riêng.
- Repo không chứa dữ liệu cá nhân, footage, nhạc, lịch sử, dự án CapCut người dùng, bản sao lưu hay gói portable.

## Phát triển và kiểm thử

```powershell
npm test
npm run smoke
```

`npm test` chạy bộ kiểm thử Node; một số kiểm thử dùng FFmpeg/ffprobe. Khi thử ứng dụng, đặt `CCB_DATA_DIR` và `CCB_OUTPUT_DIR` vào thư mục thử riêng để không tác động workspace thật. UI smoke đầy đủ cần fixture footage/nhạc, xem `tests/ui-smoke.js` và các biến `CCB_UI_TEST`, `CCB_FIXTURE_ROOT`, `CCB_REAL_PREVIEW` trong `src/main.cjs`.

## Cấu trúc

- `src/main.cjs`, `src/preload.cjs`: Electron và giao tiếp an toàn với UI.
- `src/ui/`: giao diện, phát video, chỉnh sửa footage.
- `src/store.cjs`: SQLite và lịch sử theo ngách.
- `src/selection.cjs`, `src/domain.cjs`: chọn footage, Pattern, block, timeline và nhạc.
- `src/adapter.cjs`, `src/capcut-writer.cjs`: kiểm tra tương thích và ghi draft CapCut.
- `src/preflight.cjs`: kiểm tra trước khi tạo dự án.
- `tests/`: kiểm thử thuật toán, dữ liệu, writer và UI.

Adapter được tách riêng vì định dạng CapCut có thể thay đổi. Các template JSON là cấu trúc draft dùng cho writer, không kèm media. Xem `THIRD-PARTY-NOTICES.md` về thành phần bên thứ ba.
