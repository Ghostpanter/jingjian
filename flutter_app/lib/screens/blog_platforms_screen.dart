import 'package:flutter/material.dart';

import '../models/blog_config.dart';
import '../services/app_prefs.dart';
import '../services/publish/blog_platforms.dart';
import '../theme/app_theme.dart';

/// Old app 博客平台 settings: Git static blog + WordPress/Typecho/Halo/Ghost/语雀.
class BlogPlatformsScreen extends StatefulWidget {
  const BlogPlatformsScreen({super.key});

  @override
  State<BlogPlatformsScreen> createState() => _BlogPlatformsScreenState();
}

class _BlogPlatformsScreenState extends State<BlogPlatformsScreen> {
  PlatformPrefs? _p;
  late BlogConfig _git;
  PlatformId _sel = PlatformId.git;
  String _msg = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _git = AppPrefs.instance.readBlogConfig().copy();
    readPlatformPrefs().then((p) => setState(() {
          _p = p;
          _sel = p.selected;
        }));
  }

  Future<void> _save({bool quiet = false}) async {
    _p!.selected = _sel;
    await writePlatformPrefs(_p!);
    await AppPrefs.instance.writeBlogConfig(_git);
    if (!quiet && mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已保存')));
  }

  Future<void> _test() async {
    setState(() {
      _busy = true;
      _msg = '测试中…';
    });
    try {
      await _save(quiet: true);
      final m = await BlogPlatformService.instance.test(_sel, _p!);
      setState(() => _msg = m);
    } catch (e) {
      setState(() => _msg = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _busy = false);
    }
  }

  Widget _f(String label, String value, void Function(String) set, {bool secret = false, String? hint}) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: TextFormField(
          key: ValueKey('${_sel.name}-$label'),
          initialValue: value,
          obscureText: secret,
          decoration: InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder()),
          onChanged: set,
        ),
      );

  List<Widget> _gitFields() => [
        DropdownButtonFormField<BlogHost>(
          initialValue: _git.host,
          decoration: const InputDecoration(labelText: '托管', border: OutlineInputBorder()),
          items: const [
            DropdownMenuItem(value: BlogHost.github, child: Text('GitHub')),
            DropdownMenuItem(value: BlogHost.gitee, child: Text('Gitee')),
          ],
          onChanged: (v) => setState(() => _git.host = v ?? BlogHost.github),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<BlogEngine>(
          initialValue: _git.engine,
          decoration: const InputDecoration(labelText: '博客程序', border: OutlineInputBorder()),
          items: const [
            DropdownMenuItem(value: BlogEngine.hugo, child: Text('Hugo')),
            DropdownMenuItem(value: BlogEngine.hexo, child: Text('Hexo')),
          ],
          onChanged: (v) => setState(() {
            _git.engine = v ?? BlogEngine.hugo;
            _git.postsDir = _git.engine == BlogEngine.hugo ? 'content/posts' : 'source/_posts';
          }),
        ),
        _f('Token', _git.token, (v) => _git.token = v, secret: true),
        _f('仓库', _git.repo, (v) => _git.repo = v, hint: 'owner/repo'),
        _f('分支', _git.branch, (v) => _git.branch = v),
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: TextFormField(
            key: ValueKey('postsDir-${_git.engine.name}'),
            initialValue: _git.postsDir,
            decoration: const InputDecoration(labelText: '文章目录', border: OutlineInputBorder()),
            onChanged: (v) => _git.postsDir = v,
          ),
        ),
        _f('额外 Front Matter（可选）', _git.extraFrontMatter, (v) => _git.extraFrontMatter = v),
      ];

  List<Widget> _siteFields(SiteConfig s) {
    final meta = [
      _f('分类（逗号分隔）', s.category, (v) => s.category = v),
      _f('标签（逗号分隔）', s.tags, (v) => s.tags = v),
      _f('封面图地址（可选）', s.cover, (v) => s.cover = v, hint: 'https://…'),
    ];
    switch (s.id) {
      case PlatformId.wordpress:
        return [
          _f('站点地址', s.site, (v) => s.site = v, hint: 'https://blog.example.com'),
          _f('用户名', s.username, (v) => s.username = v),
          _f('应用密码', s.password, (v) => s.password = v, secret: true, hint: '后台 → 用户 → 个人资料 → 应用密码'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('直接发布（关闭则存为草稿）'),
            value: s.publish,
            onChanged: (v) => setState(() => s.publish = v),
          ),
          ...meta,
        ];
      case PlatformId.typecho:
        return [
          _f('站点地址', s.site, (v) => s.site = v, hint: 'https://blog.example.com（或 XML-RPC 完整地址）'),
          _f('用户名', s.username, (v) => s.username = v),
          _f('密码', s.password, (v) => s.password = v, secret: true),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('直接发布'),
            subtitle: const Text('需要在 Typecho 后台开启 XML-RPC'),
            value: s.publish,
            onChanged: (v) => setState(() => s.publish = v),
          ),
          ...meta,
        ];
      case PlatformId.halo:
        return [
          _f('站点地址', s.site, (v) => s.site = v),
          _f('个人令牌', s.token, (v) => s.token = v, secret: true, hint: '后台 → 个人中心 → 个人令牌（需文章管理权限）'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('直接发布'),
            value: s.publish,
            onChanged: (v) => setState(() => s.publish = v),
          ),
          ...meta,
        ];
      case PlatformId.ghost:
        return [
          _f('站点地址', s.site, (v) => s.site = v),
          _f('Admin API 密钥', s.adminKey, (v) => s.adminKey = v, secret: true, hint: 'id:secret（后台 → Integrations）'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('直接发布'),
            value: s.publish,
            onChanged: (v) => setState(() => s.publish = v),
          ),
          ...meta,
        ];
      case PlatformId.yuque:
        return [
          _f('语雀 Token', s.token, (v) => s.token = v, secret: true, hint: '账户设置 → Token（需要超级会员/团队）'),
          _f('知识库', s.repo, (v) => s.repo = v, hint: '用户名/知识库'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('公开'),
            value: s.publish,
            onChanged: (v) => setState(() => s.publish = v),
          ),
          ...meta.skip(2),
        ];
      case PlatformId.git:
        return const [];
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    return Scaffold(
      appBar: AppBar(title: const Text('博客平台'), actions: [
        TextButton(onPressed: p == null ? null : _save, child: const Text('保存')),
      ]),
      body: p == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final id in PlatformId.values)
                  ChoiceChip(
                    label: Text(platformLabel(id)),
                    avatar: p.enabled(id, _git.isConfigured) ? Icon(Icons.check_circle, size: 16, color: JingjianColors.accent) : null,
                    selected: _sel == id,
                    onSelected: (_) => setState(() {
                      _sel = id;
                      _msg = '';
                    }),
                  ),
              ]),
              const SizedBox(height: 8),
              Text(platformInfo[_sel]!.$2, style: TextStyle(color: JingjianColors.muted, fontSize: 12)),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('启用 ${platformLabel(_sel)}'),
                subtitle: const Text('发布时可勾选的平台'),
                value: p.enabled(_sel, _git.isConfigured),
                onChanged: (v) => setState(() {
                  if (_sel == PlatformId.git) {
                    p.gitEnabled = v;
                  } else {
                    p.sites[_sel]!.enabled = v;
                  }
                }),
              ),
              if (_sel == PlatformId.git) ..._gitFields() else ..._siteFields(p.sites[_sel]!),
              const SizedBox(height: 16),
              Row(children: [
                FilledButton.tonal(onPressed: _busy ? null : _test, child: const Text('测试连接')),
                const SizedBox(width: 12),
                Expanded(child: Text(_msg, style: TextStyle(color: JingjianColors.muted))),
              ]),
              const SizedBox(height: 12),
              Text('同一篇笔记再次发布会更新原文章，不会重复创建。网页版发布可能被站点跨域策略拦住，建议用安卓或电脑应用。',
                  style: TextStyle(fontSize: 12, color: JingjianColors.muted)),
            ]),
    );
  }
}
