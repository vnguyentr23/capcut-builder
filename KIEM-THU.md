# Báo cáo kiểm thử MVP

Ngày: 08/10/2026. Môi trường: Windows, Node.js 24.11.1, Electron 44.6.0, FFmpeg có sẵn trên máy.

- **14/14 kiểm thử nghiệp vụ đạt.** Bao gồm pattern A–B–A, chu kỳ lẻ, hết footage, ưu tiên thứ tự, duplicate qua hash, ngoại lệ Hook, transform 9:16, credit, timeline Intro, timing nhạc, fade ngắn, tên Windows, SQLite mở lại, tách history theo ngách, ghi manifest nguyên tử, khóa writer CapCut và preflight trên file thật.
- **22 kiểm chứng tích hợp giao diện đạt.** Tạo video/nhạc tổng hợp bằng FFmpeg; đọc hai nhóm; kích hoạt handler kéo thả; tạo Body bằng nút UI; tự gán sáu bài; chuyển ngách giữ nhạc khóa; chạy kiểm tra; tạo manifest; xác nhận USED vẫn rỗng.
- **Kiểm tra danh sách 10.000 hàng:** tối đa 10 hàng DOM mỗi cột, kể cả khi cuộn xuống cuối. Đây là phép kiểm tra cơ chế dựng hàng, không phải benchmark quét 10.000 video dung lượng lớn.
- Ảnh giao diện Electron đã được xem kiểm tra: giao diện tối, các cột độc lập, trạng thái Hook/Body/nhạc và cảnh báo manifest hiện rõ.
- Đã đọc bản cài CapCut mới nhất trên máy: **9.6.0.4093**. Các draft gần đây đọc được JSON, schema **360000**, app **9.6.0**. Đã kiểm tra tên trường danh mục dự án để phát hiện tên trùng.

## Phần chưa được xác minh

**Chưa tạo/mở lại dự án editable bằng CapCut.** Bản MVP chỉ xuất manifest có đầy đủ ý định timeline và preset. Không thể nhập trực tiếp manifest này vào CapCut. Writer thật được khóa, các project sẵn có không bị chỉnh sửa. Quy tắc đánh dấu USED sau adapter thành công mới được kiểm chứng bằng kiểm thử transaction, chưa bằng một lần ghi dự án CapCut thật.

Chưa benchmark trên thư viện video cá nhân hàng chục nghìn file. Chưa nhận diện cùng cảnh/bài nhạc đã encode lại; fingerprint hiện dùng SHA-256 nội dung nguyên file.

Có thể chạy lại kiểm thử theo README. Media và database thử nghiệm nằm riêng ở `test-output`, không đưa vào bản cài hoạt động trên ổ F.
