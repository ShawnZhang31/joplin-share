import joplin from 'api';
import { ToolbarButtonLocation } from 'api/types';
import * as path from 'path';
import * as fs from 'fs-extra';
// 修改导入方式，确保与实际模块结构匹配
const MarkdownIt = require('markdown-it');
const { MarkupToHtml } = require('joplin-renderer');

// Share 类实现笔记分享功能
export class Share {
    private i18nStrings: Record<string, string> = {};
    private SHARE_COMMAND = 'shareNoteToLocal';
    private mdRender: any; // MarkdownIt 实例
    private markupToHtml: any; // MarkupToHtml 实例
    
    constructor() {
        // 初始化 markdown-it 渲染器
        this.mdRender = new MarkdownIt({
            html: true,
            linkify: true,
            typographer: true,
            breaks: true,
        });
        
        // 初始化 joplin-renderer
        this.markupToHtml = new MarkupToHtml();
    }

    // 初始化方法
    public async init() {
        // 获取当前语言并加载对应的语言文件
        const locale = (await joplin.settings.globalValue('locale')) || 'en';
        console.info('Locale:', locale);
        this.i18nStrings = await this.loadLocaleStrings(locale);
        console.info('Loaded i18n strings:', this.i18nStrings);
        
        // 注册分享命令
        await this.registerCommand();
        
        // 在工具栏添加分享按钮
        await joplin.views.toolbarButtons.create(
            'shareNoteToLocalButton', 
            this.SHARE_COMMAND, 
            ToolbarButtonLocation.NoteToolbar
        );
    }
    
    // 注册分享命令
    private async registerCommand() {
        await joplin.commands.register({
            name: this.SHARE_COMMAND,
            label: this.t('share'),
            iconName: 'fas fa-share-alt',
            execute: async () => {
                await this.executeShareCommand();
            },
        });
    }
    
    // 执行分享命令
    private async executeShareCommand() {
        // 1. 获取选中的笔记
        const note = await joplin.workspace.selectedNote();
        if (!note) {
            await joplin.views.dialogs.showMessageBox(this.t('noNote'));
            return;
        }

        console.log("选中的笔记:", note.title);
        console.log("选中的笔记内容:", note.body);
        
        try {
            // 打开分享设置对话框
            const shareSettings = await this.showShareDialog();
            
            // 如果用户取消了操作
            if (!shareSettings) return;
            
            // 获取分享设置信息
            const { shareType, expiration } = shareSettings;
            
            // 转换笔记内容为HTML
            const htmlContent = await this.convertNoteToHtml(note);
            
            // 实际的分享逻辑
            await this.shareNote(note, htmlContent, shareType, expiration);
            
        } catch (error) {
            console.error("分享过程出错:", error);
            await joplin.views.dialogs.showMessageBox(`操作失败: ${error.message}`);
        }
    }
    
    // 显示分享设置对话框
    private async showShareDialog(): Promise<{shareType: string, expiration: number} | null> {
        try {
            // 创建分享对话框，添加时间戳生成唯一ID
            const dialogId = `shareDialog_${Date.now()}`;
            const dialogHandle = await joplin.views.dialogs.create(dialogId);
            
            // 生成对话框 HTML 内容
            const formHtml = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;">
                    <h2 style="margin-top: 0; margin-bottom: 20px; color: #333; font-size: 18px; text-align: center;">${this.t('shareDialogTitle')}</h2>
                    <form name="shareForm">
                        <div style="margin-bottom: 15px; padding: 12px; border-radius: 5px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold;">${this.t('shareTypeLabel')}</label>
                            <div style="display: flex; gap: 15px;">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="radio" name="shareType" value="public" checked style="margin-right: 5px;"> 
                                    <span>${this.t('shareTypePublic')}</span>
                                </label>
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="radio" name="shareType" value="encrypted" style="margin-right: 5px;"> 
                                    <span>${this.t('shareTypeEncrypted')}</span>
                                </label>
                            </div>
                        </div>
                        <div style="margin-bottom: 15px; padding: 12px; border-radius: 5px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold;">${this.t('expirationLabel')}</label>
                            <input type="number" name="expiration" min="1" max="365" value="7" style="width: 100px; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
                        </div>
                    </form>
                </div>
            `;
            
            await joplin.views.dialogs.setHtml(dialogHandle, formHtml);
            
            // 设置按钮
            await joplin.views.dialogs.setButtons(dialogHandle, [
                {
                    id: 'cancel',
                    title: this.t('cancelButton')
                },
                {
                    id: 'ok',
                    title: this.t('shareButton')
                }
            ]);
            
            // 打开对话框并获取结果
            const result = await joplin.views.dialogs.open(dialogHandle);
            
            // 如果用户点击了"分享"按钮
            if (result.id === 'ok') {
                const formData = result.formData.shareForm;
                const shareType = formData.shareType;
                const expiration = parseInt(formData.expiration, 10) || 7;
                
                console.log("分享类型:", shareType);
                console.log("有效期(天):", expiration);
                
                return { shareType, expiration };
            }
            
            return null;
        } catch (error) {
            console.error("对话框错误:", error);
            throw error;
        }
    }
    
    // 将Markdown转换为HTML
    private async convertNoteToHtml(note): Promise<string> {
        try {
            // 配置选项
            const options = {
                resourceBaseUrl: '',
                // useLocalResourceCache 可能不适用于所有版本，如果遇到错误可以移除
                // useLocalResourceCache: false,
            };
            
            const theme = {
                // 可以根据需要定制主题
                backgroundColor: '#ffffff',
                color: '#333333',
                codeBgColor: '#f5f5f5',
            };
            
            try {
                // 使用已初始化的 MarkupToHtml 实例进行渲染
                const result = await this.markupToHtml.render(MarkupToHtml.MARKUP_LANGUAGE_MARKDOWN, note.body, theme, options);
                
                if (result && result.html) {
                    console.info('HTML 渲染成功!');
                    
                    // 构建完整的 HTML 文档
                    const htmlContent = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>${note.title || 'Joplin Note'}</title>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                                line-height: 1.6;
                                color: #333;
                                max-width: 800px;
                                margin: 0 auto;
                                padding: 20px;
                            }
                            img {
                                max-width: 100%;
                            }
                            pre {
                                background-color: #f5f5f5;
                                padding: 10px;
                                border-radius: 5px;
                                overflow-x: auto;
                            }
                            code {
                                font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
                                background-color: #f5f5f5;
                                padding: 2px 4px;
                                border-radius: 3px;
                            }
                            blockquote {
                                border-left: 4px solid #ddd;
                                padding-left: 15px;
                                color: #666;
                                margin-left: 0;
                            }
                            table {
                                border-collapse: collapse;
                                width: 100%;
                            }
                            table, th, td {
                                border: 1px solid #ddd;
                            }
                            th, td {
                                padding: 8px 12px;
                            }
                            th {
                                background-color: #f5f5f5;
                            }
                            ${result.cssStrings ? result.cssStrings.join('\n') : ''}
                        </style>
                    </head>
                    <body>
                        <h1>${note.title || 'Joplin Note'}</h1>
                        ${result.html}
                    </body>
                    </html>`;
                    
                    return htmlContent;
                } else {
                    throw new Error('HTML 渲染结果不包含 html 属性');
                }
            } catch (rendererError) {
                // 如果 joplin-renderer 失败，回退使用已初始化的 markdown-it
                console.warn('joplin-renderer 渲染失败，使用 markdown-it 作为备选方案:', rendererError);
                
                // 构建 HTML 文档
                const markdownHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${note.title || 'Joplin Note'}</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        img {
                            max-width: 100%;
                        }
                        pre {
                            background-color: #f5f5f5;
                            padding: 10px;
                            border-radius: 5px;
                            overflow-x: auto;
                        }
                        code {
                            font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
                            background-color: #f5f5f5;
                            padding: 2px 4px;
                            border-radius: 3px;
                        }
                        blockquote {
                            border-left: 4px solid #ddd;
                            padding-left: 15px;
                            color: #666;
                            margin-left: 0;
                        }
                        table {
                            border-collapse: collapse;
                            width: 100%;
                        }
                        table, th, td {
                            border: 1px solid #ddd;
                        }
                        th, td {
                            padding: 8px 12px;
                        }
                        th {
                            background-color: #f5f5f5;
                        }
                    </style>
                </head>
                <body>
                    <h1>${note.title || 'Joplin Note'}</h1>
                    ${this.mdRender.render(note.body)}
                </body>
                </html>`;
                
                console.log("成功使用 markdown-it 渲染 HTML 内容");
                return markdownHtml;
            }
        } catch (error) {
            console.error("HTML 渲染错误:", error);
            throw error;
        }
    }
    
    // 实际的分享逻辑
    private async shareNote(note: any, htmlContent: string, shareType: string, expiration: number) {
        try {
            const title = note.title || 'Untitled';
            const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '_'); // 清理文件名中的特殊字符
            
            // 如果是加密分享，进行简单的内容加密（在真实场景中，应使用更强的加密方法）
            let finalHtmlContent = htmlContent;
            let passwordInfo = '';
            
            if (shareType === 'encrypted') {
                // 生成随机密码（实际应用中可以让用户设置密码）
                const password = Math.random().toString(36).substring(2, 10);
                
                // 将密码添加到分享信息中
                passwordInfo = `\n${this.t('password')}: ${password}`;
                
                // 在实际应用中，这里应该实现真正的加密
                // 这里只是简单地添加一个解密脚本作为演示
                const encryptedContent = Buffer.from(htmlContent).toString('base64');
                
                finalHtmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${title} - ${this.t('encrypted')}</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
                            line-height: 1.6;
                            margin: 0;
                            padding: 20px;
                            display: flex;
                            flex-direction: column;
                            min-height: 100vh;
                            background-color: #f5f5f5;
                        }
                        .login-container {
                            max-width: 500px;
                            margin: 50px auto;
                            padding: 30px;
                            background-color: white;
                            border-radius: 8px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            text-align: center;
                        }
                        h1 {
                            margin-top: 0;
                            color: #333;
                        }
                        input {
                            width: 100%;
                            padding: 10px;
                            margin: 15px 0;
                            border: 1px solid #ccc;
                            border-radius: 4px;
                            box-sizing: border-box;
                        }
                        button {
                            background-color: #4a90e2;
                            color: white;
                            border: none;
                            padding: 10px 15px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 16px;
                        }
                        button:hover {
                            background-color: #357ab8;
                        }
                        #content-container {
                            display: none;
                        }
                    </style>
                </head>
                <body>
                    <div id="login-container" class="login-container">
                        <h1>${this.t('encryptedNoteTitle')}</h1>
                        <p>${this.t('enterPasswordPrompt')}</p>
                        <input type="password" id="password" placeholder="${this.t('passwordPlaceholder')}">
                        <button onclick="decrypt()">${this.t('decrypt')}</button>
                    </div>
                    
                    <div id="content-container"></div>
                    
                    <script>
                        // 加密的内容
                        const encryptedContent = "${encryptedContent}";
                        const correctPassword = "${password}";
                        
                        function decrypt() {
                            const enteredPassword = document.getElementById('password').value;
                            
                            if (enteredPassword === correctPassword) {
                                try {
                                    const decodedContent = atob(encryptedContent);
                                    document.getElementById('login-container').style.display = 'none';
                                    document.getElementById('content-container').innerHTML = decodedContent;
                                    document.getElementById('content-container').style.display = 'block';
                                } catch (error) {
                                    alert("解密失败: " + error);
                                }
                            } else {
                                alert("${this.t('wrongPassword')}");
                            }
                        }
                    </script>
                </body>
                </html>
                `;
            }

            console.log("最终的 HTML 内容已生成");
            
            try {
                // 创建对话框询问保存路径
                const dialogId = `savePathDialog_${Date.now()}`;
                const dialogHandle = await joplin.views.dialogs.create(dialogId);
                
                // 设置对话框内容
                const formHtml = `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        <h2 style="margin-top: 0; margin-bottom: 20px; color: #333; font-size: 18px; text-align: center;">${this.t('saveDialogTitle')}</h2>
                        <form name="saveForm">
                            <div style="margin-bottom: 15px; padding: 12px; border-radius: 5px;">
                                <label style="display: block; margin-bottom: 8px; font-weight: bold;">${this.t('savePathLabel')}</label>
                                <input type="text" name="savePath" value="${sanitizedTitle}.html" style="width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
                            </div>
                        </form>
                    </div>
                `;
                
                await joplin.views.dialogs.setHtml(dialogHandle, formHtml);
                
                // 设置按钮
                await joplin.views.dialogs.setButtons(dialogHandle, [
                    {
                        id: 'cancel',
                        title: this.t('cancelButton')
                    },
                    {
                        id: 'ok',
                        title: this.t('saveButton')
                    }
                ]);
                
                // 打开对话框并获取结果
                const result = await joplin.views.dialogs.open(dialogHandle);
                
                if (result.id === 'ok') {
                    const filePath = result.formData.saveForm.savePath;
                    
                    // 获取插件用户数据路径
                    const userDataDir = await joplin.plugins.dataDir();
                    const fullFilePath = path.join(userDataDir, filePath);
                    
                    // 确保目录存在
                    await fs.ensureDir(path.dirname(fullFilePath));
                    
                    // 保存文件
                    await fs.writeFile(fullFilePath, finalHtmlContent);
                    
                    // 显示成功消息和文件路径
                    await joplin.views.dialogs.showMessageBox(
                        `${this.t('shareSuccessMessage')}\n${this.t('validDays')}: ${expiration}${passwordInfo}\n${this.t('saveSuccess')} ${fullFilePath}`
                    );
                }
            } catch (error) {
                console.error("保存文件失败:", error);
                await joplin.views.dialogs.showMessageBox(`${this.t('saveFailed')}: ${error.message}`);
            }
        } catch (error) {
            console.error("分享失败:", error);
            throw error;
        }
    }
    
    // 加载本地化字符串
    private async loadLocaleStrings(locale: string) {

        // 获取resources目录
        const installDir = await joplin.plugins.installationDir();
        // 加载本地化字符串
        const fallbackLocale = 'en'; // 默认语言
        const normalize = (l: string) => l.replace('-', '_').toLowerCase();
        const localesDir = path.join(installDir, 'locales');
        const tryLocale = normalize(locale);
        
        // console.log(`Trying to load locale from: ${localesDir}, locale: ${tryLocale}`);
        
        let filePath = path.join(localesDir, `${tryLocale}.json`);
        let strings = {};
        
        try {
            strings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            // console.log("Successfully loaded locale strings");
        } catch (error) {
            console.log(`Failed to load locale file: ${filePath}`, error);
            try {
                filePath = path.join(localesDir, `${fallbackLocale}.json`);
                strings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                console.log("Loaded fallback locale strings");
            } catch (fallbackError) {
                console.log(`Failed to load fallback locale: ${fallbackError}`);
            }
        }
        return strings;
    }
    
    // 翻译函数
    private t(key: string): string {
        return this.i18nStrings[key] || key;
    }
}

export default Share;