import joplin from 'api';
import fs from 'fs-extra';
import * as path from 'path';
import { FileSystemItem } from 'api/types';

/**
 * 将指定笔记导出为 HTML，并返回其字符串内容。
 * 
 * @param noteId Joplin 笔记 ID
 * @returns Promise<string> 渲染后的 HTML 内容
 */

function destDir(context:any) {
	return context.destPath;
}

function resourceDir(context:any) {
	return context.destPath + '/resources';
}

/**
 * 将笔记导出为JSON格式
 * 
 * @param noteId 要导出的笔记ID
 * @param outputPath 输出目录路径，如不提供则使用临时目录
 * @returns 导出的JSON对象
 */
export async function exportNoteToJSON(noteId: string, outputPath?: string): Promise<any> {
    // 如果没有提供输出路径，使用插件数据目录
    if (!outputPath) {
        const dataDir = await joplin.plugins.dataDir();
        outputPath = path.join(dataDir, 'exports', `${Date.now()}`);
    }
    
    // 确保输出目录存在
    await fs.mkdirp(outputPath);
    const resourcesDir = path.join(outputPath, 'resources');
    await fs.mkdirp(resourcesDir);
    
    // 获取笔记详细信息
    const note = await joplin.data.get(['notes', noteId], { 
        fields: ['id', 'title', 'body', 'created_time', 'updated_time', 'parent_id', 'user_created_time', 'user_updated_time'],
        resolve_links: 1
    });
    
    if (!note) {
        throw new Error(`Note with ID ${noteId} not found`);
    }
    
    // 获取笔记资源
    const resources = await joplin.data.get(['notes', noteId, 'resources']);
    const resourceItems = resources.items || [];
    
    // 存储笔记JSON
    const notePath = path.join(outputPath, `${note.id}.json`);
    await fs.writeFile(notePath, JSON.stringify(note, null, 2), 'utf8');
    
    // 导出资源文件
    for (const resource of resourceItems) {
        try {
            // 获取资源的详细信息
            const resourceData = await joplin.data.get(['resources', resource.id], { 
                fields: ['id', 'title', 'mime', 'filename', 'created_time', 'updated_time'] 
            });
            
            // 获取资源文件
            const resourceFile = await joplin.data.get(['resources', resource.id, 'file']);
            
            // 资源元数据JSON保存路径
            const resourceMetadataPath = path.join(outputPath, `resource_${resource.id}.json`);
            await fs.writeFile(resourceMetadataPath, JSON.stringify(resourceData, null, 2), 'utf8');
            
            // 资源文件保存路径
            const resourceFilePath = path.join(resourcesDir, resource.id);
            await fs.writeFile(resourceFilePath, resourceFile.body);
            
            console.log(`Exported resource: ${resource.id}`);
        } catch (error) {
            console.error(`Error exporting resource ${resource.id}:`, error);
        }
    }
    
    // 创建一个包含笔记和资源信息的结果对象
    const result = {
        note: note,
        resources: resourceItems,
        outputPath: outputPath,
        message: `Note successfully exported to JSON at: ${outputPath}`
    };
    
    console.log(`Note ${noteId} successfully exported to ${outputPath}`);
    return result;
}

export async function exportNoteToHtml(noteId: string): Promise<string> {

    await joplin.interop.registerExportModule({
        description: 'Export note to HTML',
        format: 'json',
        target: FileSystemItem.Directory,
        isNoteArchive: false,
        onInit: async (context: any) => {
            await fs.mkdirp(destDir(context));
            await fs.mkdirp(resourceDir(context));
        },

        onProcessItem: async (context: any, _itemType: number, item: any) => {
            const filePath = destDir(context) + '/' + item.id + '.json';
            const serialized = JSON.stringify(item);
            console.log(`Exporting item ${item.id} to ${filePath}`);
            await fs.writeFile(filePath, serialized, 'utf8');
        },

        onProcessResource: async (context: any, _resource: any, filePath: string) => {
            const destPath = resourceDir(context) + '/' + path.basename(filePath);
            await fs.copy(filePath, destPath);
        },

        onClose: async (_context: any) => { },
    });

    return "Export module registered successfully. You can now use the export command to export notes to HTML.";
    //   // 1. 创建临时目录
    //   // 获取resources目录
    //   const installDir = await joplin.plugins.installationDir();
    // //   const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'joplin-export-'));
    //   const outFile = path.join(installDir, `${noteId}.html`);
    //   console.log(`Exporting note ${noteId} to HTML at ${outFile}`);

    //   try {
    //     // 2. 调用 Joplin 命令导出 HTML，包含所有资源
    //     await joplin.commands.execute('exportHtml', outFile);

    //     // 3. 读取导出的 HTML 文件
    //     const html = await fs.readFile(outFile, 'utf-8');
    //     console.log(`Note ${noteId}: ${html}`);
    //     return html;
    //   } catch (error) {
    //     console.error(`Error exporting note ${noteId} to HTML:`, error);
    //   } finally {
    //     // try {
    //     //   await fs.unlink(outFile);
    //     // } catch (error) {
    //     //   console.error(`Error cleaning up temporary file ${outFile}:`, error);
    //     // }
    //   }
}