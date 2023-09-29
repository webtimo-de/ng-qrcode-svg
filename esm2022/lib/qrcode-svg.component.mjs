import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Ecc, QrCode } from './qrcode-generator';
import * as i0 from "@angular/core";
const VALID_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3,4}){1,2}$/;
export class QrcodeSvgComponent {
    constructor() {
        this.ecl = 'medium';
        this.borderSize = 2;
        this.size = 250;
        this.backgroundColor = '#FFFFFF';
        this.foregroundColor = '#000000';
    }
    ngOnChanges(changes) {
        this.validateInputs();
        if (this.skipUpdate(changes)) {
            return;
        }
        this.qr = QrCode.encodeText(this.value, Ecc[this.ecl]);
        const s = this.qr.size + this.borderSize * 2;
        this.viewBox = `0 0 ${s} ${s}`;
        this.d = this.createD(this.borderSize);
    }
    validateInputs() {
        if (!this.value) {
            throw Error('[@webtimo-de/ng-qrcode-svg] You must provide a value!');
        }
        if (!VALID_COLOR_REGEX.test(this.backgroundColor)) {
            throw Error('[@webtimo-de/ng-qrcode-svg] You must provide a valid backgroundColor (HEX RGB) eg: #FFFFFF');
        }
        if (!VALID_COLOR_REGEX.test(this.foregroundColor)) {
            throw Error('[@webtimo-de/ng-qrcode-svg] You must provide a valid foregroundColor (HEX RGB) eg: #000000');
        }
    }
    skipUpdate({ backgroundColor, foregroundColor, size }) {
        const bgColorChanged = backgroundColor?.currentValue && !backgroundColor?.firstChange;
        const fgColorChanged = foregroundColor?.currentValue && !foregroundColor.firstChange;
        const sizeChanged = size?.currentValue && !size.firstChange;
        return bgColorChanged || fgColorChanged || sizeChanged;
    }
    createD(borderSize) {
        const parts = [];
        for (let y = 0; y < this.qr.size; y++) {
            for (let x = 0; x < this.qr.size; x++) {
                if (this.qr.getModule(x, y)) {
                    parts.push(`M${x + borderSize},${y + borderSize}h1v1h-1z`);
                }
            }
        }
        return parts.join(' ');
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "16.1.6", ngImport: i0, type: QrcodeSvgComponent, deps: [], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "16.1.6", type: QrcodeSvgComponent, selector: "qrcode-svg", inputs: { value: "value", ecl: "ecl", borderSize: "borderSize", size: "size", backgroundColor: "backgroundColor", foregroundColor: "foregroundColor", alt: "alt", ariaLabel: "ariaLabel" }, usesOnChanges: true, ngImport: i0, template: `
        <svg
                xmlns="http://www.w3.org/2000/svg"
                version="1.1"
                stroke="none"
                [attr.alt]="alt"
                [attr.aria-label]="ariaLabel"
                [attr.width]="size"
                [attr.height]="size"
                [attr.viewBox]="viewBox"
        >
            <rect width="100%" height="100%" [attr.fill]="backgroundColor"/>
            <path [attr.d]="d" [attr.fill]="foregroundColor"/>
        </svg>
    `, isInline: true, changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "16.1.6", ngImport: i0, type: QrcodeSvgComponent, decorators: [{
            type: Component,
            args: [{
                    selector: 'qrcode-svg',
                    template: `
        <svg
                xmlns="http://www.w3.org/2000/svg"
                version="1.1"
                stroke="none"
                [attr.alt]="alt"
                [attr.aria-label]="ariaLabel"
                [attr.width]="size"
                [attr.height]="size"
                [attr.viewBox]="viewBox"
        >
            <rect width="100%" height="100%" [attr.fill]="backgroundColor"/>
            <path [attr.d]="d" [attr.fill]="foregroundColor"/>
        </svg>
    `,
                    changeDetection: ChangeDetectionStrategy.OnPush
                }]
        }], propDecorators: { value: [{
                type: Input
            }], ecl: [{
                type: Input
            }], borderSize: [{
                type: Input
            }], size: [{
                type: Input
            }], backgroundColor: [{
                type: Input
            }], foregroundColor: [{
                type: Input
            }], alt: [{
                type: Input
            }], ariaLabel: [{
                type: Input
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXJjb2RlLXN2Zy5jb21wb25lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9wcm9qZWN0cy9uZy1xcmNvZGUtc3ZnL3NyYy9saWIvcXJjb2RlLXN2Zy5jb21wb25lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFDLHVCQUF1QixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQTJCLE1BQU0sZUFBZSxDQUFDO0FBQ2xHLE9BQU8sRUFBQyxHQUFHLEVBQUUsTUFBTSxFQUFDLE1BQU0sb0JBQW9CLENBQUM7O0FBRS9DLE1BQU0saUJBQWlCLEdBQUcsOEJBQThCLENBQUM7QUFxQnpELE1BQU0sT0FBTyxrQkFBa0I7SUFuQi9CO1FBcUJhLFFBQUcsR0FBMkMsUUFBUSxDQUFDO1FBQ3ZELGVBQVUsR0FBRyxDQUFDLENBQUM7UUFFZixTQUFJLEdBQW9CLEdBQUcsQ0FBQztRQUM1QixvQkFBZSxHQUFHLFNBQVMsQ0FBQztRQUM1QixvQkFBZSxHQUFHLFNBQVMsQ0FBQztLQXdEeEM7SUE5Q0csV0FBVyxDQUFDLE9BQXNCO1FBQzlCLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUV0QixJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDMUIsT0FBTztTQUNWO1FBRUQsSUFBSSxDQUFDLEVBQUUsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRU8sY0FBYztRQUNsQixJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRTtZQUNiLE1BQU0sS0FBSyxDQUFDLHVEQUF1RCxDQUFDLENBQUM7U0FDeEU7UUFFRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRTtZQUMvQyxNQUFNLEtBQUssQ0FBQyw0RkFBNEYsQ0FBQyxDQUFDO1NBQzdHO1FBRUQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUU7WUFDL0MsTUFBTSxLQUFLLENBQUMsNEZBQTRGLENBQUMsQ0FBQztTQUM3RztJQUNMLENBQUM7SUFFTyxVQUFVLENBQUMsRUFBQyxlQUFlLEVBQUUsZUFBZSxFQUFFLElBQUksRUFBZ0I7UUFDdEUsTUFBTSxjQUFjLEdBQUcsZUFBZSxFQUFFLFlBQVksSUFBSSxDQUFDLGVBQWUsRUFBRSxXQUFXLENBQUM7UUFDdEYsTUFBTSxjQUFjLEdBQUcsZUFBZSxFQUFFLFlBQVksSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUM7UUFDckYsTUFBTSxXQUFXLEdBQUcsSUFBSSxFQUFFLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7UUFFNUQsT0FBTyxjQUFjLElBQUksY0FBYyxJQUFJLFdBQVcsQ0FBQztJQUMzRCxDQUFDO0lBRU8sT0FBTyxDQUFDLFVBQWtCO1FBQzlCLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztRQUMzQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDbkMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUNuQyxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRTtvQkFDekIsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxVQUFVLElBQUksQ0FBQyxHQUFHLFVBQVUsVUFBVSxDQUFDLENBQUM7aUJBQzlEO2FBQ0o7U0FDSjtRQUNELE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMzQixDQUFDOzhHQTlEUSxrQkFBa0I7a0dBQWxCLGtCQUFrQixtUUFqQmpCOzs7Ozs7Ozs7Ozs7OztLQWNUOzsyRkFHUSxrQkFBa0I7a0JBbkI5QixTQUFTO21CQUFDO29CQUNQLFFBQVEsRUFBRSxZQUFZO29CQUN0QixRQUFRLEVBQUU7Ozs7Ozs7Ozs7Ozs7O0tBY1Q7b0JBQ0QsZUFBZSxFQUFFLHVCQUF1QixDQUFDLE1BQU07aUJBQ2xEOzhCQUVZLEtBQUs7c0JBQWIsS0FBSztnQkFDRyxHQUFHO3NCQUFYLEtBQUs7Z0JBQ0csVUFBVTtzQkFBbEIsS0FBSztnQkFFRyxJQUFJO3NCQUFaLEtBQUs7Z0JBQ0csZUFBZTtzQkFBdkIsS0FBSztnQkFDRyxlQUFlO3NCQUF2QixLQUFLO2dCQUVHLEdBQUc7c0JBQVgsS0FBSztnQkFDRyxTQUFTO3NCQUFqQixLQUFLIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSwgQ29tcG9uZW50LCBJbnB1dCwgT25DaGFuZ2VzLCBTaW1wbGVDaGFuZ2VzfSBmcm9tICdAYW5ndWxhci9jb3JlJztcclxuaW1wb3J0IHtFY2MsIFFyQ29kZX0gZnJvbSAnLi9xcmNvZGUtZ2VuZXJhdG9yJztcclxuXHJcbmNvbnN0IFZBTElEX0NPTE9SX1JFR0VYID0gL14jKD86WzAtOWEtZkEtRl17Myw0fSl7MSwyfSQvO1xyXG5cclxuQENvbXBvbmVudCh7XHJcbiAgICBzZWxlY3RvcjogJ3FyY29kZS1zdmcnLFxyXG4gICAgdGVtcGxhdGU6IGBcclxuICAgICAgICA8c3ZnXHJcbiAgICAgICAgICAgICAgICB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCJcclxuICAgICAgICAgICAgICAgIHZlcnNpb249XCIxLjFcIlxyXG4gICAgICAgICAgICAgICAgc3Ryb2tlPVwibm9uZVwiXHJcbiAgICAgICAgICAgICAgICBbYXR0ci5hbHRdPVwiYWx0XCJcclxuICAgICAgICAgICAgICAgIFthdHRyLmFyaWEtbGFiZWxdPVwiYXJpYUxhYmVsXCJcclxuICAgICAgICAgICAgICAgIFthdHRyLndpZHRoXT1cInNpemVcIlxyXG4gICAgICAgICAgICAgICAgW2F0dHIuaGVpZ2h0XT1cInNpemVcIlxyXG4gICAgICAgICAgICAgICAgW2F0dHIudmlld0JveF09XCJ2aWV3Qm94XCJcclxuICAgICAgICA+XHJcbiAgICAgICAgICAgIDxyZWN0IHdpZHRoPVwiMTAwJVwiIGhlaWdodD1cIjEwMCVcIiBbYXR0ci5maWxsXT1cImJhY2tncm91bmRDb2xvclwiLz5cclxuICAgICAgICAgICAgPHBhdGggW2F0dHIuZF09XCJkXCIgW2F0dHIuZmlsbF09XCJmb3JlZ3JvdW5kQ29sb3JcIi8+XHJcbiAgICAgICAgPC9zdmc+XHJcbiAgICBgLFxyXG4gICAgY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5PblB1c2hcclxufSlcclxuZXhwb3J0IGNsYXNzIFFyY29kZVN2Z0NvbXBvbmVudCBpbXBsZW1lbnRzIE9uQ2hhbmdlcyB7XHJcbiAgICBASW5wdXQoKSB2YWx1ZSE6IHN0cmluZztcclxuICAgIEBJbnB1dCgpIGVjbDogJ2xvdycgfCAnbWVkaXVtJyB8ICdxdWFydGlsZScgfCAnaGlnaCcgPSAnbWVkaXVtJztcclxuICAgIEBJbnB1dCgpIGJvcmRlclNpemUgPSAyO1xyXG5cclxuICAgIEBJbnB1dCgpIHNpemU6IHN0cmluZyB8IG51bWJlciA9IDI1MDtcclxuICAgIEBJbnB1dCgpIGJhY2tncm91bmRDb2xvciA9ICcjRkZGRkZGJztcclxuICAgIEBJbnB1dCgpIGZvcmVncm91bmRDb2xvciA9ICcjMDAwMDAwJztcclxuXHJcbiAgICBASW5wdXQoKSBhbHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcclxuICAgIEBJbnB1dCgpIGFyaWFMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xyXG5cclxuICAgIHByaXZhdGUgcXIhOiBRckNvZGU7XHJcblxyXG4gICAgdmlld0JveCE6IHN0cmluZztcclxuICAgIGQhOiBzdHJpbmc7XHJcblxyXG4gICAgbmdPbkNoYW5nZXMoY2hhbmdlczogU2ltcGxlQ2hhbmdlcyk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMudmFsaWRhdGVJbnB1dHMoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2tpcFVwZGF0ZShjaGFuZ2VzKSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnFyID0gUXJDb2RlLmVuY29kZVRleHQodGhpcy52YWx1ZSwgRWNjW3RoaXMuZWNsXSk7XHJcbiAgICAgICAgY29uc3QgcyA9IHRoaXMucXIuc2l6ZSArIHRoaXMuYm9yZGVyU2l6ZSAqIDI7XHJcbiAgICAgICAgdGhpcy52aWV3Qm94ID0gYDAgMCAke3N9ICR7c31gO1xyXG4gICAgICAgIHRoaXMuZCA9IHRoaXMuY3JlYXRlRCh0aGlzLmJvcmRlclNpemUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdmFsaWRhdGVJbnB1dHMoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnZhbHVlKSB7XHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdbQHdlYnRpbW8tZGUvbmctcXJjb2RlLXN2Z10gWW91IG11c3QgcHJvdmlkZSBhIHZhbHVlIScpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFWQUxJRF9DT0xPUl9SRUdFWC50ZXN0KHRoaXMuYmFja2dyb3VuZENvbG9yKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBFcnJvcignW0B3ZWJ0aW1vLWRlL25nLXFyY29kZS1zdmddIFlvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBiYWNrZ3JvdW5kQ29sb3IgKEhFWCBSR0IpIGVnOiAjRkZGRkZGJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIVZBTElEX0NPTE9SX1JFR0VYLnRlc3QodGhpcy5mb3JlZ3JvdW5kQ29sb3IpKSB7XHJcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdbQHdlYnRpbW8tZGUvbmctcXJjb2RlLXN2Z10gWW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGZvcmVncm91bmRDb2xvciAoSEVYIFJHQikgZWc6ICMwMDAwMDAnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBza2lwVXBkYXRlKHtiYWNrZ3JvdW5kQ29sb3IsIGZvcmVncm91bmRDb2xvciwgc2l6ZX06IFNpbXBsZUNoYW5nZXMpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBiZ0NvbG9yQ2hhbmdlZCA9IGJhY2tncm91bmRDb2xvcj8uY3VycmVudFZhbHVlICYmICFiYWNrZ3JvdW5kQ29sb3I/LmZpcnN0Q2hhbmdlO1xyXG4gICAgICAgIGNvbnN0IGZnQ29sb3JDaGFuZ2VkID0gZm9yZWdyb3VuZENvbG9yPy5jdXJyZW50VmFsdWUgJiYgIWZvcmVncm91bmRDb2xvci5maXJzdENoYW5nZTtcclxuICAgICAgICBjb25zdCBzaXplQ2hhbmdlZCA9IHNpemU/LmN1cnJlbnRWYWx1ZSAmJiAhc2l6ZS5maXJzdENoYW5nZTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGJnQ29sb3JDaGFuZ2VkIHx8IGZnQ29sb3JDaGFuZ2VkIHx8IHNpemVDaGFuZ2VkO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlRChib3JkZXJTaXplOiBudW1iZXIpOiBzdHJpbmcge1xyXG4gICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgIGZvciAobGV0IHkgPSAwOyB5IDwgdGhpcy5xci5zaXplOyB5KyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgeCA9IDA7IHggPCB0aGlzLnFyLnNpemU7IHgrKykge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucXIuZ2V0TW9kdWxlKHgsIHkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaChgTSR7eCArIGJvcmRlclNpemV9LCR7eSArIGJvcmRlclNpemV9aDF2MWgtMXpgKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcGFydHMuam9pbignICcpO1xyXG4gICAgfVxyXG59XHJcbiJdfQ==