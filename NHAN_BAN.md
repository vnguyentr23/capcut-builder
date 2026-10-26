# Nhân bản nhiều kênh và chuyển máy

## Ngách và kênh

- Chọn **Ngách → Kênh** trên thanh chính. Nút **＋** bên cạnh kênh tạo kênh mới.
- Thư viện thuộc ngách và dùng chung giữa các kênh. Bản nháp, thiết lập dự án, lịch sử footage và đánh dấu đã dùng thuộc từng kênh.
- Dữ liệu trước khi nâng cấp thuộc **Kênh gốc**. Khi nâng cấp, SQLite tự lưu bản `.before-channels-…sqlite` trước migration.
- Xóa ngách sẽ xóa các kênh của ngách đó; bản sao lịch sử được giữ trong cơ sở dữ liệu như trước.

## Lưu nguồn và tạo bộ mới

1. Mở tab **Nhân bản**, chọn các dự án trong lịch sử. Có thể **Lưu bộ nguồn đã chọn** để dùng nhiều lần hoặc gửi sang máy khác.
2. Tạo/chọn kênh đích, đặt tên bộ và bấm **Trộn và xem trước**. Hoặc chọn bộ đã lưu rồi **Nhân bản từ bộ này**.
3. Xem từng dự án, trộn lại riêng dự án hoặc khóa kết quả. Bản xem trước tự lưu; mở lại không tự random. Trộn lại sẽ bỏ nhạc đã gán của dự án đó.
4. Chọn hai thư mục nhạc Hook và Body, bấm **Random nhạc**. Dự án khóa giữ nguyên footage và nhạc đã có; nếu chưa có nhạc thì vẫn được gán lần đầu.
5. Bấm **KIỂM TRA BỘ DỰ ÁN**, rồi **TẠO BỘ DỰ ÁN CAPCUT** khi đã đủ tài nguyên và CapCut đã đóng.

Mỗi dự án tạo thành công được ghi vào lịch sử kênh đích. Nếu quá trình dừng giữa chừng, các dự án đã thành công được giữ và lần bấm tiếp theo bỏ qua chúng. Chưa tạo CapCut thì chưa đánh dấu USED.

## Quy tắc footage và âm thanh

- Block đầu tiên luôn là Hook. Body trộn cùng vị trí trong block, lệch tối đa một block nguồn. Hook tùy chọn trộn cùng vị trí.
- Footage cắt nhiều đoạn liên tiếp được giữ thành cụm; điểm cắt, thời lượng, tốc độ, volume, transform và keyframe cục bộ được giữ. Credit đi theo footage.
- Intro được nhận dạng riêng; ảnh kết thúc nằm cuối video và dùng nhạc block cuối. Dự án số 6 trong bộ ANIMALS: hai block 4 footage với intro riêng, không tính intro thành footage thứ năm.
- Không trùng footage trong một dự án. Các video khác trong cùng bộ có thể dùng lại footage vốn đã lặp trong bộ nguồn. Thứ tự Body mới không trùng nguồn hoặc tổ hợp đã lưu. Phần dựng video thông thường vẫn tránh lịch sử của kênh hiện tại.
- Cân bằng số block khi có phương án giữ các ràng buộc. Không tự chia block theo số lượng clip hoặc theo tên thư mục.
- Track nhạc và voice riêng của nguồn bị bỏ. Âm thanh nhúng trong footage được giữ. Nhạc mới: một bài/block, Hook trễ 3 giây, source bắt đầu từ 0, fade out tối đa 4 giây; không trùng bài trong cùng dự án, chỉ dùng bài đủ dài.
- Âm lượng và chế độ tách/giữ lời nhạc lấy từ thiết lập kênh khi tạo bộ. Hiệu ứng/filter nguồn không được mang sang; chuyển cảnh block sử dụng tài nguyên nguồn và chuẩn hóa 2 giây. File chuyển cảnh phải có trên máy nhận.

## Xuất / nhập máy khác

- **Xuất gói chuyển máy** tạo file `.ccb-remix` nén, chứa bộ nguồn, kết quả, thiết lập, lịch sử và dấu vân tay file; không chứa footage/nhạc.
- Trên máy nhận: **Nhập gói chuyển máy**, chọn gói rồi chọn các thư mục có footage và nhạc (có thể chọn nhiều). Tool so SHA-256, không chọn theo tên file đơn thuần.
- Xem báo cáo khớp/thiếu trước khi nhập. Nhiều bản có cùng SHA-256 được coi là cùng nội dung. Có thể nhập bộ chưa đủ file để tiếp tục chuẩn bị, nhưng không tạo CapCut khi thiếu tài nguyên cần dùng.
- **Liên kết file trên máy này** quét lại khi bổ sung file. Nhập lại đúng gói không nhân đôi bộ. Gói có nội dung thay đổi được nhập thành phiên bản riêng.
- Nếu file đã thiếu từ máy xuất, gói không có dấu vân tay của file ấy: cần khôi phục nguồn, lưu/xuất lại bộ nguồn. Không đoán file thay thế theo tên.
- Máy nhận vẫn cần CapCut tương thích và các tài nguyên hiệu ứng/font cần thiết. Gói không sao chép hay cài đặt hiệu ứng CapCut.

## Giới hạn nhập timeline

Nguồn cần timeline video chính liên tục, ranh giới block nhận diện qua chuyển cảnh; text phải gắn chắc chắn với footage. Track video chồng lớp hoặc keyframe tham chiếu bên ngoài segment được chặn để tránh dựng sai. Bộ mới chỉ được kiểm tra cấu trúc tự động; nên xem lại dự án đầu tiên trong CapCut trước khi dựng hàng loạt cho kênh.
# Chỉnh từng bản nhân bản trước khi tạo CapCut

Trong tab **Nhân bản**, tạo bộ bản nháp rồi chọn **Chỉnh sửa** ở video cần làm.
Nhân bản và chỉnh sửa chỉ lưu trong tool; chỉ nút **TẠO DỰ ÁN CAPCUT** mới ghi dự án thật.

- Mỗi bản nháp có Hook, các block Body, kết thúc và nhạc riêng. Bản nguồn không bị sửa.
- Bút chì xanh báo footage có chỉnh sửa kế thừa. Edit hiển thị từng đoạn cắt, điểm vào/ra, tốc độ, âm lượng và chế độ âm thanh. Một footage có nhiều đoạn được giữ riêng, không gộp mất chỉnh sửa.
- Kéo hai đầu timeline để chọn khoảng cắt và xem khung hình; Space phát/dừng. Bấm **Áp dụng** để lưu.
- **Thay cảnh** chỉ gợi ý footage từ bộ nguồn tại cùng vị trí trong block; Body chỉ lấy block lệch tối đa một, Hook lấy từ Hook. Không tự lấy cảnh mới từ folder.
- **Đổi chỗ** là thao tác thủ công: bấm ⇄ ở hai cảnh, có thể đổi Hook với Body. Điểm cắt, credit, transform và âm thanh đi theo cảnh.
- Có thể thêm video Hook từ ngoài, thêm video/ảnh kết thúc và chỉnh thời lượng ảnh. Kết thúc nằm cùng block cuối.
- Chỉnh sửa được lưu riêng và tự khóa kết quả khỏi trộn lại. Hoàn tác giữ năm thao tác gần nhất.
- Nhạc được căn lại theo block khi đổi thời lượng. Bài không đủ dài bị bỏ khỏi phân công để chọn lại, không kéo dài vượt nguồn nhạc.
- Nút tạo trong màn hình bản nháp chỉ tạo video đang mở. Các bản khác vẫn là bản nháp.

Xem trước trong tool dùng âm thanh gốc (hoặc im lặng nếu chọn bỏ tiếng). Giữ/tách lời là thiết lập truyền sang CapCut để xử lý, không phải âm thanh đã lọc trong preview. Đoạn có keyframe hoặc tốc độ cong được giữ nguyên khoảng cắt để tránh làm hỏng chỉnh sửa phức tạp; vẫn có thể đổi âm thanh.


## Thiết lập riêng cho bản nhân bản
Trong màn hình Chỉnh sửa, bấm **Thiết lập** để chỉnh âm lượng và xử lý giọng nhạc, zoom 9:16, kiểu chữ/credit, chuyển cảnh giữa Hook và các block, hiệu ứng kết thúc. Bấm **Áp dụng cho video này** để lưu riêng. Zoom/chữ/chuyển cảnh mặc định giữ nguồn; bật áp dụng mới khi cần. Các thiết lập được ánh xạ khi tạo CapCut; preview footage vẫn dùng video gốc. Nội dung credit và điểm cắt được giữ nguyên. Hiệu ứng kết thúc khớp cuối toàn video, kể cả ảnh/video kết thúc.

Để cài chung cho nhiều video: chọn bộ ở tab Nhân bản, bấm **Thiết lập cả bộ**, rồi **Áp dụng cho cả bộ**. Thiết lập mới thay thế thiết lập riêng của tất cả bản nháp chưa tạo CapCut, giữ nguyên video đã tạo. Có thể sửa riêng từng video sau đó. Trộn lại video trong cùng bộ vẫn kế thừa thiết lập chung.
