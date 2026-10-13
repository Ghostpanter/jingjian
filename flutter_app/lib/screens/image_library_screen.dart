import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/image_store.dart';
import '../theme/app_theme.dart';

class ImageLibraryScreen extends StatefulWidget {
  const ImageLibraryScreen({super.key, this.insertMode = false});
  final bool insertMode;

  @override
  State<ImageLibraryScreen> createState() => _ImageLibraryScreenState();
}

class _ImageLibraryScreenState extends State<ImageLibraryScreen> {
  List<StoredImage> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() => _loading = true);
    final items = await ImageStore.instance.list();
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  Future<void> _import() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      allowMultiple: true,
      withData: true,
    );
    if (result == null) return;
    for (final f in result.files) {
      final bytes = f.bytes;
      if (bytes == null) continue;
      await ImageStore.instance.saveBytes(bytes, f.name);
    }
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('图片库'),
        actions: [
          IconButton(onPressed: _import, icon: const Icon(Icons.add_photo_alternate_outlined)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _items.isEmpty
              ? Center(child: Text('暂无图片', style: TextStyle(color: JingjianColors.muted)))
              : GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                  ),
                  itemCount: _items.length,
                  itemBuilder: (context, index) {
                    final item = _items[index];
                    return FutureBuilder(
                      future: ImageStore.instance.fileFor(item.path),
                      builder: (context, snap) {
                        final file = snap.data;
                        return InkWell(
                          onTap: () {
                            if (widget.insertMode) {
                              Navigator.pop(context, item);
                              return;
                            }
                            final md = ImageStore.instance.markdownInsert(item);
                            Clipboard.setData(ClipboardData(text: md));
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('已复制 $md')),
                            );
                          },
                          onLongPress: () async {
                            final ok = await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                title: const Text('删除图片？'),
                                actions: [
                                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
                                  TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
                                ],
                              ),
                            );
                            if (ok == true) {
                              await ImageStore.instance.delete(item.path);
                              await _reload();
                            }
                          },
                          child: Container(
                            decoration: BoxDecoration(
                              color: JingjianColors.overlay,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: JingjianColors.border),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: file == null
                                ? const Icon(Icons.broken_image_outlined)
                                : Image.file(file, fit: BoxFit.cover),
                          ),
                        );
                      },
                    );
                  },
                ),
    );
  }
}
