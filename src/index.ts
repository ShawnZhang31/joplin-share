import joplin from 'api';
import { ToolbarButtonLocation } from 'api/types';

import { MarkupToHtml } from 'joplin-renderer';

import * as path from 'path';
import * as fs from 'fs-extra';

import { I18n } from "i18n";

async function loadLocaleStrings(locale: string) {
	// 加载本地化字符串
	const fallbackLocale = 'en'; // 默认语言
	const localesPath = path.join("./", 'locales');
	console.log(`localesPath: ${localesPath}`)

	let strings = {};
	let filePath = path.join(localesPath, `${locale}.json`);
	try {
    	strings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		console.log("读取文件成功")
  	} catch {
		console.log(`读取文件失败：${filePath}`)
		filePath = path.join(localesPath, `${fallbackLocale}.json`);
    	strings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  	}
  	return strings;

}

// 封装一个翻译函数
let i18nStrings: Record<string, string> = {};
function t(key: string): string {
	return i18nStrings[key] || key;
}

const SHARE_COMMAND = 'shareNoteToLocal';

joplin.plugins.register({
	onStart: async function() {

		// get the locale from the settings
		const locale = (await joplin.settings.globalValues(['locale'])) || ['en'];
		console.info('Locale:', locale);
		let _locale = locale[0].toLowerCase();
		// i18nStrings = await loadLocaleStrings(_locale);
		
		// console.info('i18nStrings:', i18nStrings);
		
		await joplin.commands.register({
			name: SHARE_COMMAND,
			label: "分享",
			iconName: 'fas fa-share-alt',
			execute: async () => {

				// 1. 获取选中的笔记
				const note = await joplin.workspace.selectedNote();
				if (!note) {
					await joplin.views.dialogs.showMessageBox("未选中任何笔记");
					return;
				}

				// 2. 将笔记的note.body渲染为HTML
				const options = {};
				const theme = {};

				console.log("选中的笔记:", note.title)
				console.log("选中的笔记:", note.body)
				try {
					const markupToHtml = new MarkupToHtml(options);

					const result = await markupToHtml.render(MarkupToHtml.MARKUP_LANGUAGE_MARKDOWN, note.body, theme, options);

					console.info('Rendered HTML:', result.html);


					// const html = joplin.commands.execute("renderNote", note.id)
					// console.log(html)

				} catch (error) {
					console.error(error)
				}

				// console.info('Plugin assets:', result.pluginAssets);
				// console.info('result', result);

				// const html = result.html;
				// const filePath = await joplin.commands.execute('dialog.showSaveDialog', {
				// 	title: t.saveDialogTitle,
				// 	defaultPath: note.title + '.html',
				// 	filters: [{ name: t.htmlFile, extensions: ['html'] }],
				// });
				// if (!filePath || !filePath.filePath) return;
				// const fs = require('fs');
				// fs.writeFileSync(filePath.filePath, html, 'utf8');
				// await joplin.views.dialogs.showMessageBox(t.saveSuccess + filePath.filePath);
			},
		});
		await joplin.views.toolbarButtons.create('shareNoteToLocalButton', SHARE_COMMAND, ToolbarButtonLocation.NoteToolbar);
	},
});
