import 'package:flutter/material.dart';

import '../models/blog_config.dart';
import '../models/sync_config.dart';
import '../services/app_prefs.dart';
import '../services/sync/sync_oss.dart';
import '../services/sync/sync_service.dart';
import '../services/tts_service.dart';
import '../theme/app_theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late SyncConfig _sync;
  late BlogConfig _blog;
  String _msg = '';
  bool _busy = false;

  final _theme = ThemeController.instance;
  final _tts = TtsService.instance;

  @override
  void initState() {
    super.initState();
    _tts.loadPrefs().then((_) {
      if (mounted) setState(() {});
    });
    _sync = AppPrefs.instance.readSyncConfig().copy();
    _blog = AppPrefs.instance.readBlogConfig().copy();
  }

  Future<void> _save() async {
    await AppPrefs.instance.writeSyncConfig(_sync);
    await AppPrefs.instance.writeBlogConfig(_blog);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已保存')));
    }
  }

  Future<void> _testSync() async {
    setState(() {
      _busy = true;
      _msg = '测试中…';
    });
    try {
      await AppPrefs.instance.writeSyncConfig(_sync);
      final msg = await SyncService.instance.test(_sync);
      setState(() => _msg = msg);
    } catch (e) {
      setState(() => _msg = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('设置'),
        actions: [
          TextButton(onPressed: _busy ? null : _save, child: const Text('保存')),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('外观', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final id in ThemeId.values)
              ChoiceChip(
                label: Text(themeLabels[id]!),
                selected: _theme.themeId == id,
                onSelected: (_) async {
                  await _theme.setTheme(id);
                  setState(() {});
                },
              ),
          ]),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('OLED 纯黑'),
            subtitle: Text(_theme.isDark
                ? '深色模式下背景、编辑区、侧栏、对话框使用纯黑 #000000，OLED 屏更省电'
                : '仅在深色主题（墨夜 / GitHub 深色 / 跟随系统为深色）下生效'),
            value: _theme.oled,
            onChanged: (v) async {
              await _theme.setOled(v);
              setState(() {});
            },
          ),
          Row(children: [
            const SizedBox(width: 72, child: Text('字体')),
            Expanded(
              child: SegmentedButton<EditorFont>(
                segments: [
                  for (final f in EditorFont.values) ButtonSegment(value: f, label: Text(editorFontLabels[f]!)),
                ],
                selected: {_theme.font},
                onSelectionChanged: (s) async {
                  await _theme.setFont(s.first);
                  setState(() {});
                },
              ),
            ),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            const SizedBox(width: 72, child: Text('字号')),
            Expanded(
              child: SegmentedButton<String>(
                segments: [
                  for (final e in editorSizeLabels.entries) ButtonSegment(value: e.key, label: Text(e.value)),
                ],
                selected: {_theme.size},
                onSelectionChanged: (s) async {
                  await _theme.setSize(s.first);
                  setState(() {});
                },
              ),
            ),
          ]),
          const SizedBox(height: 20),
          const Text('朗读', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18)),
          Row(children: [
            const SizedBox(width: 72, child: Text('语速')),
            Expanded(
              child: Slider(
                value: _tts.rate.clamp(0.1, 1.0),
                min: 0.1,
                max: 1.0,
                divisions: 18,
                label: _tts.rate.toStringAsFixed(2),
                onChanged: (v) => setState(() => _tts.rate = v),
                onChangeEnd: (_) => _tts.savePrefs(),
              ),
            ),
          ]),
          DropdownButtonFormField<String>(
            value: const ['zh-CN', 'zh-TW', 'zh-HK', 'en-US', 'ja-JP'].contains(_tts.lang) ? _tts.lang : 'zh-CN',
            decoration: const InputDecoration(labelText: '语种', border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: 'zh-CN', child: Text('普通话（zh-CN）')),
              DropdownMenuItem(value: 'zh-TW', child: Text('台湾国语（zh-TW）')),
              DropdownMenuItem(value: 'zh-HK', child: Text('粤语（zh-HK）')),
              DropdownMenuItem(value: 'en-US', child: Text('English (en-US)')),
              DropdownMenuItem(value: 'ja-JP', child: Text('日本語 (ja-JP)')),
            ],
            onChanged: (v) {
              setState(() => _tts.lang = v ?? 'zh-CN');
              _tts.savePrefs();
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('读完本章接着读下一章'),
            value: _tts.autoNext,
            onChanged: (v) {
              setState(() => _tts.autoNext = v);
              _tts.savePrefs();
            },
          ),
          const SizedBox(height: 20),
          const Text('云同步', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18)),
          const SizedBox(height: 8),
          DropdownButtonFormField<SyncProvider>(
            value: _sync.provider,
            decoration: const InputDecoration(labelText: '同步方式', border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: SyncProvider.off, child: Text('仅本机')),
              DropdownMenuItem(value: SyncProvider.server, child: Text('自建 sync-server')),
              DropdownMenuItem(value: SyncProvider.webdav, child: Text('WebDAV')),
              DropdownMenuItem(value: SyncProvider.folder, child: Text('本地文件夹')),
              DropdownMenuItem(value: SyncProvider.oss, child: Text('对象存储 OSS/S3')),
            ],
            onChanged: (v) => setState(() => _sync.provider = v ?? SyncProvider.off),
          ),
          SwitchListTile(
            title: const Text('自动同步'),
            value: _sync.autoSync,
            onChanged: (v) => setState(() => _sync.autoSync = v),
          ),
          if (_sync.provider == SyncProvider.server) ...[
            _field('服务器地址', _sync.serverUrl, (v) => _sync.serverUrl = v),
            _field('Token', _sync.serverToken, (v) => _sync.serverToken = v, obscure: true),
          ],
          if (_sync.provider == SyncProvider.webdav) ...[
            _field('WebDAV URL', _sync.webdavUrl, (v) => _sync.webdavUrl = v),
            _field('用户名', _sync.webdavUser, (v) => _sync.webdavUser = v),
            _field('密码', _sync.webdavPassword, (v) => _sync.webdavPassword = v, obscure: true),
            _field('路径', _sync.webdavPath, (v) => _sync.webdavPath = v),
          ],
          if (_sync.provider == SyncProvider.folder)
            _field('文件夹路径', _sync.folderPath, (v) => _sync.folderPath = v),
          if (_sync.provider == SyncProvider.oss) ...[
            DropdownButtonFormField<OssVendor>(
              value: _sync.ossVendor,
              decoration: const InputDecoration(labelText: '厂商', border: OutlineInputBorder()),
              items: OssVendor.values
                  .map((v) => DropdownMenuItem(value: v, child: Text(v.name)))
                  .toList(),
              onChanged: (v) {
                if (v == null) return;
                setState(() {
                  _sync.ossVendor = v;
                  final ep = endpointForVendor(v, _sync.ossRegion);
                  if (ep.isNotEmpty) _sync.ossEndpoint = ep;
                });
              },
            ),
            const SizedBox(height: 8),
            _field('Endpoint', _sync.ossEndpoint, (v) => _sync.ossEndpoint = v),
            _field('Region', _sync.ossRegion, (v) => _sync.ossRegion = v),
            _field('Bucket', _sync.ossBucket, (v) => _sync.ossBucket = v),
            _field('Access Key', _sync.ossAccessKey, (v) => _sync.ossAccessKey = v),
            _field('Secret Key', _sync.ossSecretKey, (v) => _sync.ossSecretKey = v, obscure: true),
            _field('前缀', _sync.ossPrefix, (v) => _sync.ossPrefix = v),
            SwitchListTile(
              title: const Text('Path-style'),
              value: _sync.ossPathStyle,
              onChanged: (v) => setState(() => _sync.ossPathStyle = v),
            ),
          ],
          if (_sync.provider != SyncProvider.off)
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton(
                onPressed: _busy ? null : _testSync,
                child: const Text('测试连接'),
              ),
            ),
          if (_msg.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_msg, style: TextStyle(color: JingjianColors.muted)),
            ),
          const Divider(height: 32),
          const Text('博客发布', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18)),
          const SizedBox(height: 8),
          DropdownButtonFormField<BlogHost>(
            value: _blog.host,
            decoration: const InputDecoration(labelText: '平台', border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: BlogHost.github, child: Text('GitHub')),
              DropdownMenuItem(value: BlogHost.gitee, child: Text('Gitee')),
            ],
            onChanged: (v) => setState(() => _blog.host = v ?? BlogHost.github),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<BlogEngine>(
            value: _blog.engine,
            decoration: const InputDecoration(labelText: '引擎', border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: BlogEngine.hugo, child: Text('Hugo')),
              DropdownMenuItem(value: BlogEngine.hexo, child: Text('Hexo')),
            ],
            onChanged: (v) {
              setState(() {
                _blog.engine = v ?? BlogEngine.hugo;
                _blog.postsDir =
                    _blog.engine == BlogEngine.hugo ? 'content/posts' : 'source/_posts';
              });
            },
          ),
          const SizedBox(height: 8),
          _field('仓库 owner/repo', _blog.repo, (v) => _blog.repo = v),
          _field('Token', _blog.token, (v) => _blog.token = v, obscure: true),
          _field('分支', _blog.branch, (v) => _blog.branch = v),
          _field('文章目录', _blog.postsDir, (v) => _blog.postsDir = v),
          _field('额外 Front Matter', _blog.extraFrontMatter, (v) => _blog.extraFrontMatter = v,
              maxLines: 3),
          const SizedBox(height: 24),
          Text(
            '桌面 / Web：可用 flutter run -d linux / chrome 或对应平台打包。',
            style: TextStyle(color: JingjianColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 24),
          const Divider(),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('关于静笺'),
            subtitle: const Text('版本 1.8.1 · 本地优先的 Markdown 笔记与阅读器\nhttps://github.com/Ghostpanter/jingjian'),
            onTap: () => showLicensePage(context: context, applicationName: '静笺', applicationVersion: '1.8.1'),
          ),
        ],
      ),
    );
  }

  Widget _field(String label, String value, ValueChanged<String> onChanged,
      {bool obscure = false, int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextFormField(
        initialValue: value,
        obscureText: obscure,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
        onChanged: onChanged,
      ),
    );
  }
}
