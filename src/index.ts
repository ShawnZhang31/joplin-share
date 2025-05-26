import joplin from 'api';
import Share from './share';

joplin.plugins.register({
	onStart: async function() {
		// 初始化Share类，处理笔记分享功能
		const share = new Share();
		await share.init();
	},
});
