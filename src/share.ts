import log from 'electron-log/renderer';

import {I18n} from "i18n";

let i18n;

class Share {


    constructor() {}

    public async init() {
        console.log('Share init');
    }
    private async confLocale(localeDir: string) {
        console.log('Conf translation');
    }
}