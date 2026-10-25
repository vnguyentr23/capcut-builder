# CapCut Compilation Builder — MVP 0.1

Ứng dụng desktop Windows để chuẩn bị video tổng hợp. Giao diện tối màu, tiếng Việt, lưu cục bộ, không render video cuối.

**Đã có bộ ghi draft CapCut editable cho CapCut 9.6 / schema 360000.** Writer tham khảo `C:\Users\user\Documents\XAO_VIDEO` (engine, export, capcut-install và author-style) cùng mẫu draft trên máy. Tạo track video, chữ, nhạc, fade và chuyển cảnh; không render video cuối. Bộ kiểm thử xác nhận cấu trúc, tham chiếu, thời gian, backup/index và đã tạo một project thử trên máy. Chưa xác minh hình ảnh bằng thao tác mở timeline trong giao diện CapCut; cần kiểm tra lại vị trí chữ và hiệu ứng trong CapCut. Phiên bản khác bị chặn cho đến khi adapter được kiểm tra.

**Xem footage:** thumbnail xuất hiện trong từng cột, Hook và Body. Bấm ▶ hoặc tên video để phát ngay trên thẻ, không mở modal. Chỉ một video phát tại một thời điểm; cuộn thẻ ra khỏi danh sách ảo hoặc đổi ngách sẽ dừng phát. Thumbnail được tạo bằng FFmpeg khi thẻ gần xuất hiện, tối đa 2 tác vụ đồng thời, cache trong `data/thumbnails`. Video có codec không được Electron hỗ trợ sẽ báo lỗi phát.

**Ẩn clip cũ:** bật sẵn “Ẩn footage đã dùng”. Bỏ chọn để nhìn thấy clip cũ và lấy vào Hook; Body vẫn luôn chặn footage đã dùng ở các video trước trong cùng ngách.

**Xóa ngách:** nút cạnh Đổi tên ngách, yêu cầu nhập XÓA. Bỏ thiết lập/lịch sử ngách khỏi danh sách hoạt động, giữ nguyên file media và các project CapCut đã tạo. Bản sao dữ liệu ngách được giữ trong SQLite trước khi xóa. Xóa ngách cuối cùng sẽ tạo ngách trống mới.

**Nhạc theo block:** “Số footage mỗi block” độc lập với pattern, mặc định 3 cho ngách mới. Pattern A–B–C–D–E–F và block 3 tạo các block ABC / DEF / ABC… Mỗi block một bài đủ dài, bắt đầu từ 0:00. Hook chỉ một bài; Kết thúc nối bài của block cuối. Fade tối đa 4 giây. Nhạc đã khóa hợp lệ được giữ; sau khi đổi kích thước block, dùng “Gán / bổ sung nhạc đủ dài” để bổ sung nếu cần.

**Tạo project thật:** chọn chế độ **Dự án CapCut editable** (mặc định), lưu và đóng CapCut, rồi bấm **TẠO DỰ ÁN CAPCUT**. Sau khi thành công, mở CapCut và chọn đúng tên project. Writer tạo thư mục `CCB_<tên>_<id>`, hai file `draft_content.json`, metadata và chỉ mục `Timelines`; ghi thêm vào `root_meta_info.json` sau khi sao lưu. Không sửa project sẵn có. Không tiếp tục ghi nếu CapCut đang mở hoặc index vừa thay đổi. Chế độ **Bản kế hoạch** vẫn có thể chọn riêng.

**Chuyển cảnh cơ bản:** Hòa tan dùng gói Mờ đã tải; Chớp sáng dùng gói cùng tên. Nếu không tìm thấy gói tương ứng (ví dụ Quét ngang), preflight yêu cầu chọn một chuyển cảnh đã tải hoặc chọn Không; không âm thầm thay bằng hiệu ứng khác. Font hỗ trợ trực tiếp gồm Arial, Times New Roman, Calibri, Segoe UI, Tahoma, Verdana và file TTF đúng tên trong Windows Fonts.

## Mở ứng dụng

1. Mở thư mục `F:\TOOL\CapCut Compilation Builder`.
2. Nhấp đúp **Khoi dong.cmd**.
3. Electron đã được cài kèm ở `node_modules\electron\dist`. Lần chạy thường không cần Internet, Python, tài khoản hoặc API key.

Nếu chuyển sang máy khác hoặc thiếu thư mục `node_modules`: cài Node.js 24+, chạy **Cai dat.cmd** khi có Internet, rồi chạy **Khoi dong.cmd**. Cài FFmpeg và bảo đảm `ffprobe` có trong PATH, hoặc tại `C:\ffmpeg\bin\ffprobe.exe`. Trên máy triển khai FFmpeg đã có sẵn. File không đọc được metadata sẽ được báo lỗi và không chọn vào Body; ứng dụng không đoán thời lượng.

## Quy trình sử dụng

**Chuyển cảnh CapCut đã tải:** mở **Thiết lập → Chuyển cảnh & CapCut**, bấm **Đọc chuyển cảnh đã tải từ CapCut**. Chọn loại **Chuyển cảnh CapCut đã tải**, tìm tên rồi chọn tài nguyên và thời lượng. Bộ dò đọc database cache ở chế độ chỉ đọc, đối chiếu metadata loại chuyển cảnh với thư mục gói có `config.json`; không tải thêm, không chạy mã trong gói và không chỉnh sửa file CapCut. Danh sách lưu cục bộ, lựa chọn lưu riêng theo draft/ngách; bấm đọc lại sau khi tải thêm hoặc xóa cache. Trên máy kiểm thử đã nhận ra 22 tài nguyên. Nhãn Pro phản ánh metadata, không xác nhận quyền sử dụng tài khoản. Nếu cache đổi cấu trúc hoặc gói bị xóa, app có thể không nhận ra; preflight kiểm tra lại sự tồn tại của gói đã chọn.

**Khoảng chuyển cảnh:** chuyển cảnh ở ranh giới block, cùng ranh giới đổi nhạc; bỏ thiết lập N riêng. Hook/Intro không tính vào số footage. Không thêm chuyển cảnh giữa Body cuối và Kết thúc vì cùng block. Ngách cũ lấy kích thước block từ khoảng chuyển cảnh đã lưu.

**Chọn footage trong cột:** mặc định **Ngày tạo ↑ (cũ trước)**, dùng thời gian tạo file của Windows (không phải thời điểm quay video). Có ngày tạo giảm dần, tên tăng/giảm và thủ công. File không đọc được ngày tạo nằm cuối. Nút **Random** chỉ xáo cột đó và lưu thứ tự; không tự xáo lại khi chuyển ngách hay mở app. Nút Lên đầu chuyển cột sang thủ công; footage khóa giữ vị trí, muốn di chuyển cần bỏ khóa. Chọn thứ tự hoặc random không thay Body đã dựng; bấm **Tạo Body** để dùng thứ tự mới.

**Xóa và tự bù:** nút **Xóa** trong cột hoặc **Xóa & thay thế** trên thẻ Body loại footage khỏi lựa chọn của ngách, không xóa file gốc. Loại theo fingerprint để không chọn lại bản sao ở cột khác. Clip có trong Hook cũng được bỏ khỏi Hook. Body giữ các clip còn lại, ưu tiên bù đúng cột vừa xóa; khi hết, bù từ cột có ít footage trong Body nhất còn file hợp lệ. Bài nhạc khóa ở vị trí thay được giữ nguyên, thời điểm phát được tính lại theo clip mới. Nếu toàn thư viện thiếu, báo đúng số thiếu và preflight chặn tạo dự án; không lặp clip. Nút **Khôi phục… clip đã xóa** ở đầu cột đưa các clip đã loại trở lại thư viện. Quét lại thư mục không tự khôi phục clip đã loại. Dữ liệu này tách theo ngách, không đổi lịch sử USED.

**Bố cục mới:** thư viện, cột Hook/Kết thúc và Body nằm cạnh nhau, cuộn độc lập. Cột Hook/Kết thúc rộng bằng nửa cột Body. Thanh “Kích thước xem” phóng thumbnail từ 100% đến 200%, lưu theo ngách và không thay đổi tỉ lệ video xuất sang CapCut. Sidebar mặc định đóng, chứa pattern, số footage mỗi block, Intro và các preset.

1. Tạo/chọn **Ngách** và đặt tên dự án. Mỗi ngách nhớ riêng thư mục cha, nhóm, thứ tự, credit nhập tay, thiết lập, draft và lịch sử.
2. Chọn **Thư mục cha**, bấm **Đọc các nhóm con**. Mỗi thư mục con trực tiếp thành một nhóm; app đọc video trong cây thư mục của nhóm. Nếu không có thư mục con, thư mục cha thành một nhóm. Hoặc dùng **Thêm nhóm → Thư mục** để chọn từng pool.
3. Trong mỗi cột: bấm **Lên đầu**, **🔒 / 🔓**, **✂**, hoặc nhấn thumbnail để xem trực tiếp trong tool. Nút **Tên**, **← / →**, **×** quản lý nhóm. Xóa nhóm chỉ xóa tham chiếu trong app, không xóa video gốc. Tìm kiếm và lọc “Chỉ chưa dùng” áp dụng cho mọi cột.
4. Bấm **＋ Hook** trong cột hoặc **Chọn video** trong Hook. Dùng nút **↑ / ↓** trên thẻ Hook để đổi thứ tự. File đã dùng trước đó chỉ có cảnh báo nhẹ. **Lặp ở Body** là ngoại lệ theo từng clip; mặc định tắt. Duplicate trong Hook bị chặn theo hash, kể cả file đổi tên.
5. Chọn Intro nếu cần; mặc định sau Hook, có thể trước Hook hoặc sau X footage Body. Chọn video Kết nếu cần.
6. Tạo pattern bằng cách chọn nhóm và bấm **Thêm vào pattern**. Một nhóm có thể xuất hiện nhiều lần, ví dụ A–B–A–C. Kéo các bước để đổi thứ tự, × để bỏ bước. Target mặc định **58 footage Body**, không tính Hook, Intro, Kết. Giới hạn MVP 1–2.000. Bấm **Tạo Body**.
7. Chọn ba thư mục nhạc **Hook / Body / Kết** ở phần thiết lập. Nếu đã chọn đủ thư mục, **Tạo Body** tự gán các bài còn thiếu. **Gán nhạc còn thiếu** giữ các bài đã khóa; **Random lại tất cả** mới thay toàn bộ lựa chọn. Sau khi thêm/bớt Hook hoặc Kết, bấm gán nhạc còn thiếu để cập nhật. Đổi thư mục nhạc không tự đổi nhạc đã khóa.
8. Điều chỉnh chuyển cảnh, video dọc và chữ nguồn. Bấm **KIỂM TRA DỰ ÁN** để xem lỗi/cảnh báo.
9. Bấm **TẠO DỰ ÁN CAPCUT**. Chế độ CapCut tạo project editable sau khi kiểm tra. Chế độ Bản kế hoạch tạo manifest riêng. **Mở đầu ra** mở thư mục kết quả vừa tạo.

## Quy tắc đang áp dụng

**Preset v3:** footage 9:16 chỉ chỉnh tỉ lệ, mặc định **140%**. Chữ luôn căn trái, mặc định tỉ lệ **20%**, cỡ **15**, cách lề trái **50 px** và lề dưới **50 px**. Khoảng cách đo đến mép khung chữ đã áp tỉ lệ; neo `bottom-left` tại (50, 1030) trên canvas 1920×1080. Khi xuống dòng, khung chữ mở rộng lên trên, giữ lề dưới. Nhạc mặc định **−10 dB**, manifest lưu cả dB và gain tuyến tính. Preset v2 tự chuyển lề phải cũ thành lề dưới, giữ tỉ lệ, cỡ chữ, âm lượng và các lựa chọn đã lưu. Bỏ chọn căn giữa/phải vì chữ luôn nằm bên trái.

- Body chọn theo thứ tự từng nhóm, loại hash đã dùng trong **ngách hiện tại**, hash đã chọn trong Body, clip bị xóa khỏi lựa chọn, Hook chưa bật ngoại lệ, Intro và Kết. Nhóm không đủ được bù từ các nhóm còn footage theo số lượng đóng góp thấp nhất; phần bù được ghi nhận trong Body và preflight. Pattern vẫn được ưu tiên khi nhóm còn file; cân bằng áp dụng cho phần thiếu, không đảo lại các clip còn hợp lệ của Body. Tổng thư viện không đủ sẽ báo thiếu.
- Theo dõi từng file bằng ID tạo từ đường dẫn chuẩn hóa, kích thước và SHA-256; lưu cả thời lượng, kích thước hình, mtime. USED theo fingerprint nội dung, không theo chỉ số. Di chuyển/đổi tên file vẫn nhận ra lịch sử khi quét lại; bản sao byte-for-byte cũng được nhận ra. Không nhận diện cùng cảnh đã bị encode/cắt lại bằng nhận diện hình ảnh.
- Source nhập tay lưu riêng theo ngách và media ID; tự đọc `ten-video.txt` cạnh `ten-video.mp4`. Nội dung tối đa 2.000 ký tự. Credit theo clip khi reorder. Metadata được cache, muốn thay credit đã cache hãy nhập bằng nút **Nguồn**.
- Hook dùng một bài, trễ mặc định 3 giây so với đầu Hook. Nếu Hook ngắn hơn hoặc bằng độ trễ, preflight yêu cầu chỉnh lại.
- Mỗi footage Body dùng một bài khác nhau, source start bằng 0, timeline start bằng đầu clip. Kết dùng một bài riêng. SHA-256 phát hiện cùng bài dạng bản sao nguyên vẹn giữa ba pool, kể cả đổi tên. Không có blacklist nhạc toàn cục. Các bản encode khác nhau của cùng một bài không được nhận diện bằng fingerprint âm học.
- Nếu bài nhạc ngắn hơn segment, app cảnh báo và kết thúc nhạc sớm, không loop. Fade out mặc định 4 giây, rút xuống tối đa bằng thời lượng audio segment. Chọn bài dùng matching giữa các pool để không báo thiếu giả khi chúng chồng lấn.
- Tỉ lệ footage chỉ áp khi hình xấp xỉ 9:16 (có xét metadata xoay); 16:9 giữ nguyên. Canvas dự kiến 1920×1080, 30 fps. UI dùng phần trăm, manifest dùng hệ số (140% = 1,4). Lề chữ tính theo pixel canvas, neo ở góc dưới trái của khung chữ. Đây là thông số trong manifest, chưa là preview hiệu ứng đã render.
- Chuyển cảnh theo số footage mỗi block, đồng bộ nhạc. Duration không vượt quá nửa clip ngắn hơn ở hai bên. Hỗ trợ tài nguyên chuyển cảnh CapCut đã tải.
- Manifest và draft không ghi USED. Chỉ kết quả adapter loại `capcut`, `compatible=true`, `verified=true` mới được phép commit lịch sử footage trong transaction SQLite. Hook được lưu riêng role và không xóa lịch sử cũ. Bản MVP chưa cung cấp thao tác đánh dấu thành công giả.

## Lưu dữ liệu và khôi phục

- `data\workspace.sqlite`: ngách, media cache, draft, lịch sử, usage; dùng SQLite WAL. Tự lưu sau thao tác và đồng bộ lần cuối khi đóng cửa sổ.
- `Du an\<tên dự án>\manifest.json`: timeline/nhạc/nguồn/preset, thông tin dò CapCut, các đường dẫn media gốc. Kèm `ĐỌC TÔI.txt` giải thích giới hạn. Không sao chép video, không tạo video đầu ra.
- Khi bấm **Dự án mới**, draft có Hook/Body được cất vào lịch sử dưới nhãn **Bản nháp**. Các manifest được lưu dưới nhãn **Bản kế hoạch**. Mở lại bằng **Mở bản lưu**; draft đang làm cũng được cất trước khi thay.
- Một draft hoạt động cho mỗi ngách. Chuyển ngách và đóng/mở app giữ nguyên lựa chọn nhạc.
- Sao lưu: đóng app rồi sao chép thư mục `data` và `Du an`. Giữ nguyên media gốc. Nếu thay video tại cùng đường dẫn, preflight phát hiện size/mtime đổi và yêu cầu quét lại.
- App không tự nhập lịch sử từ các dự án CapCut trước khi cài MVP. Bảng USED ban đầu rỗng; việc nhập lịch sử CapCut cũ cần một bộ nhập riêng.

## Kiến trúc để mở rộng

| Thành phần | Trách nhiệm |
|---|---|
| `src/main.cjs` | Electron, hộp thoại Windows, IPC có danh sách cho phép, điều phối tác vụ |
| `src/store.cjs` | SQLite, lịch sử tách ngách, transaction USED sau thành công |
| `src/media.cjs` | Quét bất đồng bộ, tối đa 3 tác vụ, ffprobe, SHA-256 và cache |
| `src/domain.cjs` | Pattern, timeline, music matching, manifest, tên dự án |
| `src/preflight.cjs` | Validator trước mọi lần ghi |
| `src/adapter.cjs` | Dò CapCut, chọn writer CapCut hoặc manifest |
| `src/capcut-writer.cjs` | Dựng track editable, kiểm tra, sao lưu và đăng ký project |
| `src/ui/` | UI tiếng Việt; mỗi cột chỉ dựng các hàng trong vùng nhìn thấy và một số hàng đệm, Body chia trang 60 clip |

Không tải mọi video vào RAM. Lần quét đầu cần đọc toàn bộ byte để hash nên có thể lâu trên hàng nghìn file lớn; lần sau tái sử dụng metadata/hash nếu size và mtime không đổi. UI không phát hàng loạt video; preview bằng trình phát mặc định. Dữ liệu mô tả/ID nhóm hiện được nạp vào RAM; chưa có thumbnail cache và paging từ SQL cho thư viện cực lớn. Không hỗ trợ hủy lượt quét giữa chừng trong bản này.

Electron dùng context isolation, renderer sandbox, không bật Node trong UI; không tải nội dung web từ xa. SQLite nằm ở tiến trình chính. Các hiệu ứng, crop và chữ trong manifest chưa có màn hình preview hình ảnh trực tiếp.

### Thêm writer CapCut thật

Kế thừa `CapCutAdapter` với `detect()` và `write()`. Bộ ghi hiện tại nằm tại `src/capcut-writer.cjs`, mẫu cấu trúc đã loại dữ liệu media nguồn tại `src/capcut-template.json`. Ghi vào thư mục tạm, kiểm tra tính toàn vẹn, đối chiếu index cũ và sao lưu trước khi commit. Kết quả `verification: schema-and-readback` chỉ xác nhận cấu trúc và đọc lại file, không xác nhận đã xem hình ảnh trong CapCut. Manifest là hợp đồng trung gian giúp thay writer mà giữ nguyên thư viện và quy tắc nghiệp vụ.

## Kiểm thử

```powershell
npm test
npm run smoke
```

`npm test` kiểm tra pattern, identity, uniqueness, timing, preflight, persistence và adapter. `npm run smoke` chạy cửa sổ ẩn, kiểm tra UI rồi lưu báo cáo và ảnh tại `data\smoke-result.json`, `data\smoke.png`.

Kiểm thử tích hợp với media tổng hợp (không dùng video cá nhân):

```powershell
node tests\prepare-fixtures.cjs
$env:CCB_DATA_DIR = Join-Path (Get-Location) 'test-output\data'
$env:CCB_OUTPUT_DIR = Join-Path (Get-Location) 'test-output\manifests'
$env:CCB_FIXTURE_ROOT = Join-Path (Get-Location) 'test-output\fixtures'
$env:CCB_UI_TEST = '1'
npm run smoke
```

Đóng cửa sổ PowerShell kiểm thử sau khi chạy để các biến kiểm thử không ảnh hưởng lần mở thường. Không chạy smoke cùng lúc với app đang mở vì ứng dụng chỉ cho phép một instance.

Tham khảo nền tảng: [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Node.js SQLite](https://nodejs.org/api/sqlite.html).


### Lịch sử footage và hai cách xóa
Khi lưu manifest thành công hoặc bấm Dự án mới, footage Body và Hook được giữ chỗ theo ngách. Body của video tiếp theo tránh toàn bộ footage đó; Hook vẫn có thể dùng lại với cảnh báo. Draft hiện tại không tự chặn footage của chính nó. Các bản lưu cũ được đưa vào lịch sử này tự động. Manifest vẫn chưa phải project CapCut và không bị gắn trạng thái USED giả.
Nút Xóa có hai lựa chọn: chỉ xóa trong video này (có thể dùng lại ở draft mới), hoặc xóa vĩnh viễn khỏi ngách (có thể chủ động khôi phục). Cả hai đều không xóa file gốc và đều tự bù Body, ưu tiên cùng nhóm rồi cân bằng các nhóm còn lại.


### Hook ngoài thư viện, khung dọc và kết thúc theo dự án
- Hook: bấm **＋ Chọn video** để chọn nhiều file. Đã bỏ kéo thả footage, kể cả từ Windows Explorer. Đọc file, chống trùng theo fingerprint, vẫn cảnh báo nếu đã dùng ở video trước. File gốc được tham chiếu, không sao chép hoặc di chuyển.
- Thumbnail và trình phát trên thẻ dùng khung **9:16**, giữ toàn bộ hình gốc bằng fit/letterbox. Canvas project CapCut vẫn 1920×1080; đây chỉ là bố cục xem footage.
- **Kết thúc** nằm trên màn hình dự án. Chọn video hoặc ảnh PNG/JPEG/WebP/BMP. Ảnh mặc định 5 giây; có thể chỉnh từ 0,1 đến 3.600 giây. Ảnh xuất thành material photo editable trong CapCut, nhạc End theo đúng thời lượng ảnh. Khi tạo dự án mới phần kết thúc để trống, không lấy lại từ dự án trước.
- **Pattern** chuyển vào sidebar **Thiết lập → Pattern của ngách**. Số footage Body và nút Tạo Body vẫn ở màn hình chính. Pattern vẫn được giữ khi tạo dự án mới trong cùng ngách.


### Chữ nguồn, tên tự động và giới hạn Body
- Nguồn ưu tiên nội dung nhập tay, tiếp theo file `.txt` đã đọc; nếu chưa có nguồn thì lấy tên video bỏ phần mở rộng. Ví dụ `Aronne Chan.mp4` → `Aronne Chan`. Nội dung này tạo track chữ editable trong CapCut. Có thể nhập nguồn khác bằng nút ©; chủ động lưu nguồn rỗng sẽ tắt chữ cho clip đó. Các project CapCut đã tạo trước bản cập nhật không tự thay đổi, cần tạo lại để nhận track chữ.
- Tên draft mới mặc định `Tên ngách_1`, `Tên ngách_2`… Số tăng riêng từng ngách khi bấm Dự án mới, không tăng theo số lần autosave. Tên nhập tay được giữ. Tên mặc định cũ “Dự án mới…” được chuyển sang quy tắc mới. Khi tên ngách chứa ký tự cấm Windows, tên project được làm sạch tự động.
- N là số footage Body tối đa. Khi thiếu footage mới, app dùng số hợp lệ hiện có, từ 1 đến N; không tái dùng footage cũ để bù và không tự lặp. Body dưới N vẫn qua preflight. Nhạc vẫn chia theo các block thực tế, block cuối có thể ít hơn số footage đã đặt.


### Nhạc liên tục cho Hook và block cuối (v3)
- Toàn bộ Hook dùng đúng một bài, bắt đầu muộn 3 giây (hoặc theo thiết lập), không đổi bài giữa các footage Hook.
- Video/ảnh Kết thúc thuộc block Body cuối: cùng bài tiếp tục đến hết Kết thúc, fade ở cuối. Không còn thư mục/bài nhạc Kết riêng trong giao diện.
- Đọc thời lượng file gốc bằng ffprobe. Chỉ chọn bài đủ dài cho toàn block; Gán / bổ sung nhạc đủ dài giữ các bài khóa hợp lệ và thay bài quá ngắn. Không có đủ bài dài thì báo lỗi rõ và chặn tạo project, không tự để khoảng im lặng.
- Intro có tùy chọn “Sau số block Body”, mặc định số block là 1; block cuối thiếu footage vẫn tính là một block. Nhạc block kế tiếp bắt đầu sau Intro.
- Mốc clip, nhạc và chuyển cảnh cùng được tính theo khung 30fps, tránh để CapCut tự làm tròn riêng từng track. Nhạc và chuyển cảnh cùng theo kích thước block; pattern chỉ chọn thứ tự footage.
- Đã đối chiếu test_2: Hook có một bài; hai bài Body gốc dài 85,59s và 80,10s, ngắn hơn block 118,47s và 111,73s. Có bản sửa riêng test_2_da_sua, không sửa project gốc.

### Khóa vị trí và cắt footage
- Bấm ổ khóa nhỏ ở góc trên bên phải thẻ footage trong cột. Viền xanh là đã khóa. Random, sắp xếp theo tên/ngày tạo và nút Lên đầu chỉ di chuyển các footage chưa khóa. Khóa lưu theo từng nhóm/ngách, giữ qua mở lại app. Tìm kiếm/ẩn footage đã dùng chỉ thay danh sách hiển thị, không đổi thứ tự đã lưu; khóa không bỏ qua quy tắc footage đã dùng.
- Bấm **✂** trên thumbnail ở thư viện, Hook hoặc Body để mở thanh cắt ngay trên workspace. Kéo hai tay nắm trên timeline hoặc nhập giây bắt đầu/kết thúc. Nút **▶** phát/tạm dừng đoạn đã chọn. Bấm **Áp dụng** để lưu; **↺** xóa điểm cắt và dùng cả video; × đóng và bỏ thay đổi chưa áp dụng.
- Điểm cắt căn theo timeline 30 fps và phải nằm trong thời lượng file gốc. Áp dụng cho cùng footage trong Hook/Body của draft; được giữ khi tạo draft tiếp theo trong ngách và lưu trong lịch sử dự án. File gốc không bị cắt hay ghi đè. Dự án CapCut ghi đúng điểm bắt đầu nguồn, độ dài đoạn cắt và giữ thời lượng gốc trong media material.
- Thời lượng Body, nhạc block, fade, credit và chuyển cảnh tính theo đoạn cắt. Nếu mở rộng lại clip khiến bài nhạc đang khóa không đủ dài, preflight yêu cầu gán/bổ sung nhạc. Chỉ cắt một đoạn của footage vẫn tính cả footage đó là đã dùng theo quy tắc lịch sử.
- Không còn kéo thả footage trong thư viện/Hook hay nhập bằng thả file. Nút chọn video và ＋ Hook thay thao tác này; các bước pattern vẫn có thể kéo để đổi thứ tự.

### Sửa khóa khi có bộ lọc và timeline cắt trực tiếp
- Random/sắp xếp chỉ đổi các footage đang hiển thị và chưa khóa. File bị ẩn do đã dùng, loại khỏi dự án hoặc tìm kiếm giữ nguyên ô, nên không đẩy footage khóa xuống danh sách hiển thị. Giữ vị trí cuộn khi cập nhật cột; mở lại không tự sắp xếp lại thứ tự đã lưu. File mới khi quét lại được nối cuối; bấm bộ sắp xếp để xếp lại theo nhu cầu.
- Thanh cắt có video xem trước và timeline với hai tay nắm. Kéo tay nắm trái/phải để chọn điểm đầu/cuối; kéo vùng xanh để di chuyển cả đoạn; bấm timeline để tua. Chọn tay nắm rồi nhấn ←/→ để chỉnh từng frame, Shift+←/→ để chỉnh một giây. Các ô số vẫn dùng được khi cần nhập chính xác. Bấm Áp dụng để lưu điểm cắt.
- Đã bỏ nút nhập nguồn/credit trên footage card. Credit tự đọc từ file .txt hoặc tên footage và các nguồn đã lưu vẫn được xuất sang CapCut.

### Xem khung hình trong lúc kéo điểm cắt
- Kéo tay nắm đầu/cuối, vùng chọn hoặc tua timeline sẽ cập nhật khung hình video ngay trong quá trình kéo. Các yêu cầu tua nhanh được gộp về vị trí mới nhất sau khi giải mã xong khung hình trước.
- Video trong bộ cắt dùng chung thanh **Kích thước xem 100–200%** với footage. Giao diện giữ hai ô Từ/Đến, nút phát/tạm dừng, đặt lại và Áp dụng; đã bỏ nút lấy thời điểm đang xem, điều khiển video trùng lặp và dòng hướng dẫn dài.

### Tua khung hình và bố cục Hook/Body
- Hook/Kết thúc nằm ở cột bên trái. Nút **Ẩn Body / Hiện Body** trên thanh công cụ đóng/mở phần Body đã tạo, trả lại không gian cho thư viện footage. Trạng thái được lưu theo ngách; chỉ thay đổi giao diện, không xóa Body.
- Bộ phát phục vụ byte range (206 / Content-Range) để tua file video chính xác. Khi kéo điểm cắt, app đồng thời lấy khung hình trực tiếp bằng FFmpeg; chỉ xử lý một yêu cầu mỗi lần và giữ vị trí mới nhất đang chờ. Khi phát thử, bỏ ảnh xem điểm cắt để phát video bình thường.
- Sau khi phát thử rồi mở rộng đoạn cắt, bộ phát không còn ép trở lại điểm cuối cũ. Đã bổ sung kiểm tra kéo ra ngoài đoạn vừa phát thử trên file thực tế.

### Thẻ thư viện cố định và xem video khi cắt
- Thẻ trong Thư viện footage cố định 144 px (2/3 mức 216 px trước đây), bước cuộn 148 px. Tăng Kích thước xem chỉ phóng nội dung bên trong khung ảnh cao 144 px; phần vượt khung bị khuất, tên và nút thao tác vẫn hiển thị. Hook, Body và khung video cắt giữ cách phóng riêng như trước.
- Trong bộ cắt, bấm **Xem video** hoặc bấm trực tiếp lên video để phát/tạm dừng đoạn được chọn. Tạm dừng rồi phát tiếp sẽ tiếp tục từ vị trí hiện tại nếu còn trong đoạn; khi đã tới cuối thì phát lại từ đầu đoạn. Khung hình xem khi kéo được gỡ khi phát video.

- Thư viện: video chiếm toàn bộ chiều cao thẻ 144 px. Tên file, khóa vị trí và các nút Hook / Lên đầu / Xóa nằm trên dải hẹp bên phải, không có hàng thông tin dưới video.

### Card icon và modal cắt
- Thẻ thư viện giữ chiều cao 144 px, chỉ có cột icon hẹp bên phải: khóa, cắt, thêm Hook, lên đầu, xóa. Di chuột lên icon để xem chức năng. Tên file nhỏ, mờ ở góc trên trái video; tên đầy đủ hiện khi di chuột.
- Bấm ✂ mở modal cắt, có video xem trước, timeline kéo đầu/cuối, phát/tạm dừng và Áp dụng. Đóng bằng ×, Esc hoặc bấm ngoài modal; thay đổi chỉ lưu khi Áp dụng. Kích thước xem vẫn tác động đến video xem trước trong modal.

### Bù footage ngắn trong block
- Vào **Thiết lập → Pattern**, bật **Bù thêm footage cho clip ngắn** và đặt ngưỡng giây (mặc định 5 giây, tính năng mặc định tắt để giữ các draft cũ). Bấm **Tạo Body** để áp dụng.
- Mỗi footage gốc có thời lượng **nhỏ hơn** ngưỡng được thêm đúng một footage ngay sau nó. Thời lượng xét theo đoạn đã cắt; bằng ngưỡng không bù. Clip bù không được bù tiếp.
- Ưu tiên clip bù cũng ngắn hơn ngưỡng, trong cùng nhóm hoặc nhóm khác; khi hết clip ngắn mới lấy clip dài hơn. Luôn tránh footage đã dùng trong ngách, footage trùng và footage đã loại. Nếu không còn clip hợp lệ, báo thiếu và vẫn cho tạo dự án.
- Target và số footage mỗi block tính theo **footage gốc**. Clip bù nằm cùng block với clip gốc, dùng chung nhạc; chuyển cảnh và Intro nằm sau toàn bộ block đã bù. Kết thúc vẫn nối block cuối.
- Body hiển thị riêng số gốc và số bù. Khi đổi ngưỡng, bật/tắt hoặc thay điểm cắt, bấm Tạo Body để cập nhật. Nhạc phải đủ thời lượng block mới; dùng Gán nhạc còn thiếu để thay bài quá ngắn.

### Tạm ẩn cột và đếm footage khóa
- Bấm **−** ở tiêu đề cột để tạm ẩn; bấm tên cột ở hàng **Cột đã ẩn** để hiện lại. Trạng thái lưu riêng theo ngách, không thay đổi pattern, Body hoặc việc chọn footage.
- Số **🔒** trên tiêu đề là tổng footage đã khóa vị trí trong cột, kể cả clip đang bị bộ lọc ẩn. Bộ đếm cập nhật ngay khi khóa/bỏ khóa, không tính ID đã rời khỏi nhóm.

### Âm thanh gốc footage trong CapCut
- Dự án mới giữ tiếng gốc trong clip video ở 100% (0 dB), nhạc nền giữ mức riêng −10 dB. Không cần trích WAV hay tạo thêm track tiếng gốc.
- Bộ ghi đặt rõ `extra_type_option=0`, `has_sound_separated=false` cho video chưa tách tiếng; không kế thừa cờ tách tiếng từ template. Audio stream được kiểm tra bằng ffprobe trước khi ghi dự án.
- Bản BABY ANIMALS_1 đã được sửa trước đó bằng track WAV riêng vẫn dùng track đó. Không xóa thư mục `Projects/CCB_Footage_Audio` khi dự án này còn tham chiếu.

### Card cố định và modal Chỉnh sửa
- Card Hook và Body cố định 144 px, khung video 134 px như Thư viện. Kích thước xem chỉ phóng nội dung bên trong; phần vượt khung bị khuất.
- Nút ✎ **Chỉnh sửa** thay nút cắt. Trong modal có điểm đầu/cuối và **Âm thanh footage**: Giữ nguyên / Bỏ lời / Giữ lời. Bấm Áp dụng để lưu theo footage; đóng modal bỏ thay đổi chưa lưu.
- **Space** phát/dừng video khi ở modal, không chiếm phím khi đang nhập thời gian hoặc chọn chế độ. Giữ Space không bật/tắt liên tục.
- Xem trước trong tool dùng tiếng gốc. CapCut tự xử lý lọc giọng khi mở dự án, theo đúng đoạn cắt; chờ xử lý xong trước khi xuất. Lựa chọn gắn với clip, không tác động nhạc nền.
- Đã thử draft ba chế độ trên CapCut 9.6: `choice=1` hiển thị Bỏ lời, `choice=2` cho nhánh Giữ lời; CapCut tự tạo WAV xử lý trong Resources/audioAlg. Ba đoạn xuất từ cùng source 0–6 giây cho mức âm khác nhau (gốc −15,9 dB; bỏ lời −17,6 dB; giữ lời −21,4 dB).

## Hạ nhạc theo từng footage
Trong Thiết lập → Nhạc → Ưu tiên tiếng footage. Tính năng mặc định bật. Nhạc bình thường dùng ô Âm lượng (dB); nhạc khi ưu tiên footage mặc định −20 dB, không tăng âm lượng nếu nhạc vốn nhỏ hơn.
Tool xét RMS trung bình trên toàn đoạn footage sau cắt: có tiếng đáng kể thì hạ nhạc cho cả footage; gần im lặng, không có audio hoặc tắt tiếng thì giữ mức nhạc bình thường. Ngưỡng mặc định −32 dB, càng âm sâu càng nhạy. Không còn nâng/hạ nhạc theo các khoảng ngừng bên trong clip, không sử dụng cài đặt thời gian chờ của bản cũ.
Nhạc được cắt ở ranh giới cần đổi âm lượng, các đoạn cùng mức liền nhau được gộp lại, thời gian nguồn nối tiếp nên không phát lại bài từ đầu. Fade cuối giữ nguyên thời lượng; nếu có footage ưu tiên giao với fade, giữ mức thấp hết fade. Có thể chỉnh tiếp các đoạn nhạc trong CapCut.
Phân tích chạy khi tạo dự án hoặc manifest, dùng FFmpeg và tiếng gốc, không sửa file nguồn. Lọc lời trong CapCut chưa được phản ánh vào phân tích; đây là nhận diện mức âm thanh, không hiểu nội dung tiếng nói. Dự án CapCut đã tạo không tự thay đổi. Manifest lưu phương pháp footage-rms và các khoảng hạ nhạc để đối chiếu.