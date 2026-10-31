import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

class MelodiyaUpdateManager extends StatefulWidget {
  const MelodiyaUpdateManager({required this.child, super.key});
  final Widget child;

  @override
  State<MelodiyaUpdateManager> createState() => _MelodiyaUpdateManagerState();
}

class _MelodiyaUpdateManagerState extends State<MelodiyaUpdateManager>
    with WidgetsBindingObserver {
  static const _manifestUrl =
      'https://xdtgtwlpkgldszmufoay.supabase.co/storage/v1/object/public/melodiya-app-updates/version.json';
  static const _appId = 'com.melodiya.melodiya_app';
  static const _checkInterval = Duration(hours: 12);
  static const _maxBytes = 100 * 1024 * 1024;

  bool _checking = false;
  bool _downloading = false;
  bool _dialogOpen = false;
  DateTime? _lastCheck;
  Map<String, dynamic>? _update;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_check());
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || _checking || _downloading) return;
    final last = _lastCheck;
    if (last == null || DateTime.now().difference(last) >= _checkInterval) {
      unawaited(_check());
    }
  }

  Future<void> _check() async {
    if (_checking) return;
    _checking = true;
    _lastCheck = DateTime.now();
    try {
      final info = await PackageInfo.fromPlatform();
      if (info.packageName != _appId) return;
      final uri = Uri.parse(_manifestUrl).replace(
        queryParameters: {'t': DateTime.now().millisecondsSinceEpoch.toString()},
      );
      final response = await http.get(uri, headers: const {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }).timeout(const Duration(seconds: 20));
      if (response.statusCode != 200) return;
      final data = jsonDecode(response.body);
      if (data is! Map) return;
      final update = Map<String, dynamic>.from(data);
      if (update['appId'] != _appId) return;
      final latest = int.tryParse(update['buildNumber']?.toString() ?? '');
      final current = int.tryParse(info.buildNumber) ?? 0;
      final apk = Uri.tryParse(update['apkUrl']?.toString() ?? '');
      final hash = update['sha256']?.toString().toLowerCase() ?? '';
      if (latest == null || latest <= current || apk == null ||
          apk.scheme != 'https' || !RegExp(r'^[a-f0-9]{64}$').hasMatch(hash)) {
        return;
      }
      if (!mounted) return;
      setState(() => _update = update);
      await _showDialog(update, current);
    } catch (_) {
      // Updates are optional; network errors must not block app startup.
    } finally {
      _checking = false;
    }
  }

  Future<void> _showDialog(Map<String, dynamic> update, [int? current]) async {
    if (!mounted || _dialogOpen || _downloading) return;
    _dialogOpen = true;
    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: update['mandatory'] != true,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.system_update_rounded,
              color: Color(0xFFA855F7), size: 34),
          title: const Text('Melodiya update available'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Version ' + (update['version']?.toString() ?? 'Latest') +
                  ' (build ' + (update['buildNumber']?.toString() ?? '') + ') is ready.'),
              if (current != null) ...[
                const SizedBox(height: 6),
                Text('Installed build: $current',
                    style: const TextStyle(color: Colors.white60, fontSize: 12)),
              ],
              if ((update['releaseNotes']?.toString() ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(update['releaseNotes'].toString()),
              ],
              const SizedBox(height: 12),
              const Text('The APK is verified before Android opens its installer.',
                  style: TextStyle(color: Colors.white54, fontSize: 12)),
            ],
          ),
          actions: [
            if (update['mandatory'] != true)
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Later'),
              ),
            FilledButton.icon(
              onPressed: () {
                Navigator.of(ctx).pop();
                unawaited(_download(update));
              },
              icon: const Icon(Icons.download_rounded),
              label: const Text('Update now'),
            ),
          ],
        ),
      );
    } finally {
      _dialogOpen = false;
    }
  }

  Future<void> _download(Map<String, dynamic> update) async {
    if (_downloading || !Platform.isAndroid) return;
    final uri = Uri.tryParse(update['apkUrl']?.toString() ?? '');
    final expected = update['sha256']?.toString().toLowerCase() ?? '';
    final build = update['buildNumber']?.toString() ?? 'latest';
    if (uri == null || uri.scheme != 'https' ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(expected)) return;

    setState(() => _downloading = true);
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(const SnackBar(
      duration: Duration(minutes: 4),
      content: Text('Downloading Melodiya update…'),
    ));
    final client = http.Client();
    File? file;
    try {
      final dir = await getTemporaryDirectory();
      file = File(dir.path + '/melodiya-update-' + build + '.apk');
      if (await file.exists()) await file.delete();
      final request = http.Request('GET', uri);
      final response = await client.send(request)
          .timeout(const Duration(minutes: 3));
      if (response.statusCode != 200) {
        throw HttpException('APK download failed: HTTP ' + response.statusCode.toString());
      }
      if (response.contentLength != null && response.contentLength! > _maxBytes) {
        throw const FormatException('APK is larger than allowed.');
      }
      final sink = file.openWrite();
      var received = 0;
      try {
        await for (final chunk in response.stream.timeout(const Duration(minutes: 4))) {
          received += chunk.length;
          if (received > _maxBytes) throw const FormatException('APK is larger than allowed.');
          sink.add(chunk);
        }
        await sink.flush();
      } finally {
        await sink.close();
      }
      if (received == 0) throw const FormatException('Downloaded APK is empty.');
      final actual = sha256.convert(await file.readAsBytes()).toString();
      if (actual != expected) throw const FormatException('APK checksum mismatch; update blocked.');
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(const SnackBar(
        content: Text('Download verified. Opening Android installer…'),
      ));
      final result = await OpenFilex.open(
        file.path,
        type: 'application/vnd.android.package-archive',
      );
      if (result.type != ResultType.done) {
        throw StateError(result.message);
      }
    } catch (error) {
      if (file != null && await file.exists()) {
        try { await file.delete(); } catch (_) {}
      }
      if (mounted) {
        messenger.hideCurrentSnackBar();
        messenger.showSnackBar(SnackBar(
          content: Text('Could not install update: ' + error.toString()),
        ));
      }
    } finally {
      client.close();
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      widget.child,
      if (_update != null && !_downloading)
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          right: 12,
          child: SafeArea(
            child: FilledButton.tonalIcon(
              onPressed: () => unawaited(_showDialog(_update!)),
              icon: const Icon(Icons.system_update_alt_rounded, size: 18),
              label: const Text('Update'),
            ),
          ),
        ),
    ]);
  }
}
