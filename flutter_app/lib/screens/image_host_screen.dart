import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/image_upload.dart';
import '../theme/app_theme.dart';

class ImageHostScreen extends StatefulWidget {
  const ImageHostScreen({super.key});

  @override
  State<ImageHostScreen> createState() => _ImageHostScreenState();
}

class _ImageHostScreenState extends State<ImageHostScreen> {
  ImageConfig? _c;
  String _msg = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    readImageConfig().then((c) => setState(() => _c = c));
  }

  Future<void> _save({bool quiet = false}) async {
    await writeImageConfig(_c!);
    if (!quiet && mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已保存')));
  }

  Future<void> _test() async {
    setState(() {
      _busy = true;
      _msg = '测试中…';
    });
    try {
      await _save(quiet: true);
      final m = await ImageUploadService.instance.test(_c!);
      setState(() => _msg = m);
    } catch (e) {
      setState(() => _msg = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _importPicgo() async {
    String? raw;
    final pick = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(title: const Text('导入 PicGo / Typora 配置'), children: [
        SimpleDialogOption(onPressed: () => Navigator.pop(ctx, 'file'), child: const Text('选择 data.json 文件')),
        SimpleDialogOption(onPressed: () => Navigator.pop(ctx, 'clip'), child: const Text('从剪贴板粘贴 JSON')),
      ]),
    );
    if (pick == 'file') {
      final r = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['json'], withData: true);
      final b = r?.files.firstOrNull?.bytes;
      if (b != null) raw = const Utf8Codec().decode(b, allowMalformed: true);
    } else if (pick == 'clip') {
      raw = (await Clipboard.getData('text/plain'))?.text;
    }
    if (raw == null || raw.trim().isEmpty) return;
    try {
      final next = applyPicgoConfig(raw, _c!);
      setState(() {
        _c = next;
        _msg = '已导入：${imageUploaderLabels[next.uploader]}';
      });
      await _save(quiet: true);
    } catch (e) {
      setState(() => _msg = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Widget _field(String label, String value, void Function(String) set, {bool secret = false, String? hint}) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: TextFormField(
          key: ValueKey('${_c!.uploader.name}-$label'),
          initialValue: value,
          obscureText: secret,
          decoration: InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder()),
          onChanged: set,
        ),
      );

  List<Widget> _uploaderFields(ImageConfig c) {
    switch (c.uploader) {
      case ImageUploader.none:
        return const [];
      case ImageUploader.github:
        return [
          _field('GitHub Token', c.githubToken, (v) => c.githubToken = v, secret: true, hint: '需要 repo / contents 写权限'),
          _field('仓库', c.githubRepo, (v) => c.githubRepo = v, hint: 'owner/repo'),
          _field('分支', c.githubBranch, (v) => c.githubBranch = v),
          _field('目录', c.githubPath, (v) => c.githubPath = v),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: DropdownButtonFormField<String>(
              initialValue: c.githubLink,
              decoration: const InputDecoration(labelText: '图片链接', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'jsdelivr', child: Text('jsDelivr CDN')),
                DropdownMenuItem(value: 'raw', child: Text('raw.githubusercontent.com')),
                DropdownMenuItem(value: 'custom', child: Text('自定义域名')),
              ],
              onChanged: (v) => setState(() => c.githubLink = v ?? 'jsdelivr'),
            ),
          ),
          if (c.githubLink == 'custom') _field('自定义域名', c.githubDomain, (v) => c.githubDomain = v, hint: 'https://img.example.com'),
        ];
      case ImageUploader.gitee:
        return [
          _field('Gitee 私人令牌', c.giteeToken, (v) => c.giteeToken = v, secret: true),
          _field('仓库', c.giteeRepo, (v) => c.giteeRepo = v, hint: 'owner/repo'),
          _field('分支', c.giteeBranch, (v) => c.giteeBranch = v),
          _field('目录', c.giteePath, (v) => c.giteePath = v),
        ];
      case ImageUploader.smms:
        return [_field('SM.MS Token', c.smmsToken, (v) => c.smmsToken = v, secret: true, hint: 'sm.ms → Dashboard → API Token')];
      case ImageUploader.lsky:
        return [
          _field('兰空图床地址', c.lskyUrl, (v) => c.lskyUrl = v, hint: 'https://img.example.com'),
          _field('Token', c.lskyToken, (v) => c.lskyToken = v, secret: true, hint: '1|xxxxxxxx'),
        ];
      case ImageUploader.imgur:
        return [_field('Imgur Client ID', c.imgurClientId, (v) => c.imgurClientId = v)];
      case ImageUploader.picgo:
        return [
          _field('PicGo Server 地址', c.picgoUrl, (v) => c.picgoUrl = v,
              hint: 'http://127.0.0.1:36677/upload，手机可填电脑的局域网 IP'),
        ];
      case ImageUploader.custom:
        return [
          _field('上传地址（POST multipart）', c.customUrl, (v) => c.customUrl = v),
          _field('Token（可选，自动加 Bearer）', c.customToken, (v) => c.customToken = v, secret: true),
          _field('文件字段名', c.customFileField, (v) => c.customFileField = v),
          _field('返回 JSON 中图片地址的路径', c.customUrlPath, (v) => c.customUrlPath = v, hint: 'data.url'),
        ];
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    return Scaffold(
      appBar: AppBar(title: const Text('图床'), actions: [
        TextButton(onPressed: c == null ? null : _save, child: const Text('保存')),
      ]),
      body: c == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              DropdownButtonFormField<ImageInsertAction>(
                initialValue: c.insertAction,
                decoration: const InputDecoration(labelText: '插入/粘贴图片时', border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: ImageInsertAction.none, child: Text('保存到本机图片库')),
                  DropdownMenuItem(value: ImageInsertAction.copy, child: Text('复制到本机图片库（远程图片也下载）')),
                  DropdownMenuItem(value: ImageInsertAction.upload, child: Text('上传到图床，插入网络地址')),
                ],
                onChanged: (v) => setState(() => c.insertAction = v ?? ImageInsertAction.none),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<ImageUploader>(
                initialValue: c.uploader,
                decoration: const InputDecoration(labelText: '上传服务', border: OutlineInputBorder()),
                items: [
                  for (final u in ImageUploader.values) DropdownMenuItem(value: u, child: Text(imageUploaderLabels[u]!)),
                ],
                onChanged: (v) => setState(() => c.uploader = v ?? ImageUploader.none),
              ),
              ..._uploaderFields(c),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('上传后在本机图片库保留一份'),
                subtitle: const Text('关闭则只保留网络地址'),
                value: c.keepLocalCopy,
                onChanged: (v) => setState(() => c.keepLocalCopy = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('对本机图片生效'),
                value: c.applyToLocal,
                onChanged: (v) => setState(() => c.applyToLocal = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('对网络图片生效'),
                subtitle: const Text('粘贴网络图片地址时下载后再保存/上传'),
                value: c.applyToRemote,
                onChanged: (v) => setState(() => c.applyToRemote = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('本机路径加 ./ 前缀'),
                value: c.relativeDotSlash,
                onChanged: (v) => setState(() => c.relativeDotSlash = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('对图片地址做 URL 转义'),
                value: c.escapeUrl,
                onChanged: (v) => setState(() => c.escapeUrl = v),
              ),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilledButton.tonal(onPressed: _busy ? null : _test, child: const Text('测试连接')),
                OutlinedButton(onPressed: _importPicgo, child: const Text('导入 PicGo / Typora 配置')),
              ]),
              if (_msg.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_msg, style: TextStyle(color: JingjianColors.muted)),
                ),
              const SizedBox(height: 12),
              Text('提示：PicGo 需要在 PicGo 设置里打开「Server」。网页版上传受浏览器跨域限制，建议用安卓或电脑应用。',
                  style: TextStyle(fontSize: 12, color: JingjianColors.muted)),
            ]),
    );
  }
}
