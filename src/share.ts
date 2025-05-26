import joplin from 'api';
import { ToolbarButtonLocation } from 'api/types';
import { MarkupToHtml } from 'joplin-renderer';
import * as path from 'path';
import * as fs from 'fs-extra';

// Share 类实现笔记分享功能
export class Share {
    private i18nStrings: Record<string, string> = {};
    private SHARE_COMMAND = 'shareNoteToLocal';
    
    constructor() {}

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
            const htmlContent = await this.convertNoteToHtml(note.body);
            
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
            // 创建分享对话框
            const dialogHandle = await joplin.views.dialogs.create('shareDialog');
            
            // 生成对话框 HTML 内容
            const formHtml = `
                <form name="shareForm">
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 5px;">${this.t('shareTypeLabel')}</label>
                        <label style="margin-right: 10px;">
                            <input type="radio" name="shareType" value="public" checked> ${this.t('shareTypePublic')}
                        </label>
                        <label>
                            <input type="radio" name="shareType" value="encrypted"> ${this.t('shareTypeEncrypted')}
                        </label>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px;">${this.t('expirationLabel')}</label>
                        <input type="number" name="expiration" min="1" max="365" value="7" style="width: 100px;">
                    </div>
                </form>
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
    private async convertNoteToHtml(markdownContent: string): Promise<string> {
        try {
            // 使用 joplin-renderer 将 Markdown 内容转换为 HTML
            const markupToHtml = new MarkupToHtml();
            const renderResult = await markupToHtml.render(
                MarkupToHtml.MARKUP_LANGUAGE_MARKDOWN,
                markdownContent,
                {}, // 主题
                {
                    bodyOnly: true,
                }
            );
            
            console.log("成功渲染HTML内容");
            return renderResult.html;
        } catch (error) {
            console.error("HTML 渲染错误:", error);
            throw error;
        }
    }
    
    // 实际的分享逻辑
    private async shareNote(note: any, htmlContent: string, shareType: string, expiration: number) {
        try {
            // 这里实现实际的分享逻辑
            // 例如上传到服务器、生成链接等
            // 目前仅显示成功消息作为示例
            
            // 显示成功消息
            await joplin.views.dialogs.showMessageBox(
                `分享链接已生成，有效期: ${expiration}天，类型: ${
                    shareType === "public" ? this.t('shareTypePublic') : this.t('shareTypeEncrypted')
                }`
            );
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