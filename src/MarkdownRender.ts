// @see https://github.com/ylc395/joplin-plugin-pages-publisher/blob/main/src/driver/generator/joplinPlugin/MarkdownRenderer.ts


import joplin from 'api';
import fs from 'fs-extra';
import * as path from 'path';
import { FileSystemItem } from 'api/types';
import { MarkupToHtml} from '@joplin/renderer';
import { ResourceInfo } from '@joplin/renderer/types';
import { json } from 'stream/consumers';


const PLUGIN_SETTING_PREFIX = 'markdown.plugin.';
const AUDIO_PLAYER_PLUGIN = 'audioPlayer';
const VIDEO_PLAYER_PLUGIN = 'videoPlayer';
const PDF_VIEWER_PLUGIN = 'pdfViewer';


export class MarkdownRenderer {
    private mdPluginOptions?: Record<string, unknown>;
    //   private resources?: ResourceMap;
    private outputDir?: string;
    private pluginAssetDir?: string;
    private readonly fileIdPool = new Set();
    private sourceUrls?: Record<string, string | undefined>;
    //   constructor(private readonly articles: Article[]) {}

    constructor() { }

    async init() {
        await this.fetchJoplinMarkdownSettings();
    }

    private async fetchJoplinMarkdownSettings() {
        // @see https://github.com/laurent22/joplin/blob/1bc674a1f9a1f5021142d040459ef127db71ee62/packages/lib/models/Setting.ts#L873
        const pluginNames = [
            'softbreaks',
            'typographer',
            'linkify',
            'katex',
            'fountain',
            'mermaid',
            AUDIO_PLAYER_PLUGIN,
            VIDEO_PLAYER_PLUGIN,
            PDF_VIEWER_PLUGIN,
            'mark',
            'footnote',
            'toc',
            'sub',
            'sup',
            'deflist',
            'abbr',
            'emoji',
            'insert',
            'multitable',
        ];

        const values = await Promise.all<boolean>(
            pluginNames.map((name) => joplin.settings.globalValue(`${PLUGIN_SETTING_PREFIX}${name}`)),);

        this.mdPluginOptions = values.reduce((result, enabled, i) => {
            result[pluginNames[i]] = { enabled };
            return result;
        }, {} as Record<string, unknown>);

    }

    async render(noteId:string): Promise<string> {
        if (!this.mdPluginOptions) {
            throw new Error('MarkdownRenderer not initialized');
        }

        let options = {
            bodyOnly: true,
            // audioPlayerEnabled: true,
            // videoPlayerEnabled: true,
            pdfViewerEnabled: true,
        }

        // 获取note内容
        const note = await joplin.data.get(['notes', noteId], { fields: ['title', 'body'] });
        let body = note.body;
        const title = note.title;

        // 将资源替换为Base64编码
        const resourceRegex = /(!?\[.*?\])\(:\/([a-f0-9]{32})\)/g;
        const matches = [...body.matchAll(resourceRegex)];

        for (const match of matches) {
            const fullMatch = match[0];          // ![xxx](:/abcd)
            const label = match[1];              // ![xxx] 或 [xxx]
            const resourceId = match[2];         // abcd...

            const resource = await joplin.data.get(['resources', resourceId], { fields: ['mime', 'file_extension'] });
            const mime = resource.mime;
            const ext = resource.file_extension;
            console.log(`Resource ID: ${resourceId}, MIME Type: ${mime}, Extension: ${ext}`);



            // 获取二进制内容
            const arrayBuffer = await joplin.data.get(['resources', resourceId, 'file']);
            const buffer = Buffer.from(arrayBuffer.body as any);
            const base64 = buffer.toString('base64');
            const dataUri = `data:${mime};base64,${base64}`;

            // 替换为 data URI
            let newTag = '';
            if (mime.startsWith('image/')) {
                newTag = `<p><img src="${dataUri}" alt="${label}"></p>`;
            } else if (mime.startsWith('audio/')) {
                newTag = `<p><audio controls src="${dataUri}">Your browser does not support the audio tag.</audio></p>`;
            } else if (mime.startsWith('video/')) {
                newTag = `<p><video controls width="100%"><source src="${dataUri}" type="${mime}">Your browser does not support the video tag.</video></p>`;
            } else if (mime === 'application/pdf') {
                // 使用 PDF 查看器插件
                console.log("Using PDF Viewer plugin for resource ID: ", resourceId);
                newTag = `<p><embed src="${dataUri}" width="100%" height="600px" type="application/pdf"></p>`;
            } else {
                // fallback: 用下载链接
                newTag = `<p><a href="${dataUri}" download="attachment.${ext || 'bin'}">下载附件</a></p>`;
            }
            body = body.replace(fullMatch, newTag);
            console.log(`Replaced resource: ${fullMatch} with ${newTag}`);
            // console.log(`Resource ID: ${resourceId}, MIME Type: ${mime}`);
            // console.log(`Resource : ${resource.title}`);
        }

        console.log("body after resource replacement: ", body);

        const markupToHtml = new MarkupToHtml();   
        // console.log("new body: ", body);
        const { html, pluginAssets, cssStrings } = await markupToHtml.render(MarkupToHtml.MARKUP_LANGUAGE_MARKDOWN, body, {}, options);

        return html;
    }

}

